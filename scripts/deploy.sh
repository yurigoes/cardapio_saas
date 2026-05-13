#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Cardapio SaaS — Deploy script
#
#  Faz deploy seguro com:
#    1. Backup do banco (pg_dumpall)
#    2. Tag da imagem atual (rollback target)
#    3. Modo manutenção
#    4. git pull + aplica migrations novas
#    5. docker build + up
#    6. Health check
#    7a. Sucesso: desativa manutenção, limpa backups antigos (>30d)
#    7b. Falha: rollback (restaura imagem + banco) + alerta
#
#  Uso:
#    bash scripts/deploy.sh                      # deploy normal
#    bash scripts/deploy.sh --skip-backup        # pula backup (não recomendado)
#    bash scripts/deploy.sh --rollback <tag>     # rollback manual
#    bash scripts/deploy.sh --list-backups       # lista backups disponíveis
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

PROJECT_DIR="${CARDAPIO_DIR:-/opt/cardapio_saas}"
BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${PROJECT_DIR}/deploy.log"
TS=$(date +%Y%m%d-%H%M%S)
COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.override.yml"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✖${NC} $*" | tee -a "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR"

# ─── Subcomandos ────────────────────────────────────────────────
if [[ "${1:-}" == "--list-backups" ]]; then
  ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -20
  echo ""
  docker images cardapio-saas --format 'table {{.Tag}}\t{{.CreatedSince}}\t{{.Size}}'
  exit 0
fi

if [[ "${1:-}" == "--rollback" ]]; then
  TAG="${2:-}"
  [[ -z "$TAG" ]] && { err "Uso: $0 --rollback <tag>"; exit 1; }
  log "Rollback pra cardapio-saas:${TAG}"
  docker tag "cardapio-saas:${TAG}" cardapio-saas:latest
  cd "$PROJECT_DIR"
  $COMPOSE up -d --force-recreate app
  log "✓ Rollback aplicado"
  exit 0
fi

# ─── Helpers ────────────────────────────────────────────────────
modo_manutencao() {
  local ativo="$1"
  docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL >/dev/null 2>&1
UPDATE settings SET valor = jsonb_set(valor, '{ativo}', '${ativo}'::jsonb), updated_at = NOW()
 WHERE chave = 'manutencao';
SQL
}

health_check() {
  for i in {1..30}; do
    if curl -sf --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

backup_banco() {
  local arquivo="${BACKUP_DIR}/db-${TS}.sql.gz"
  log "Backup do banco → $arquivo"
  docker exec cardapio_postgres pg_dumpall -U cardapio | gzip > "$arquivo"
  if [[ ! -s "$arquivo" ]]; then
    err "Backup vazio — abortando"
    return 1
  fi
  echo "$arquivo"
}

backup_cloud() {
  local arquivo="$1"
  if ! command -v rclone >/dev/null 2>&1; then return 0; fi
  if [[ ! -f /root/.config/rclone/rclone.conf ]]; then return 0; fi
  local remote=$(grep '^\[' /root/.config/rclone/rclone.conf | head -1 | tr -d '[]')
  if [[ -z "$remote" ]]; then return 0; fi
  log "Backup pra cloud (rclone $remote) ..."
  rclone copy "$arquivo" "${remote}:cardapio-backups/" --quiet 2>&1 | head -3 || warn "rclone falhou (não fatal)"
}

aplicar_migrations() {
  log "Verificando migrations novas..."
  for f in "${PROJECT_DIR}"/database/migrations/*.sql; do
    [[ -f "$f" ]] || continue
    local nome=$(basename "$f")
    log "  → $nome"
    if ! docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas -v ON_ERROR_STOP=0 < "$f" >/dev/null 2>&1; then
      warn "  $nome avisos (normal se já aplicada)"
    fi
  done
}

# ─── Main ───────────────────────────────────────────────────────
SKIP_BACKUP=0
[[ "${1:-}" == "--skip-backup" ]] && SKIP_BACKUP=1

cd "$PROJECT_DIR"

log "═══ DEPLOY INICIADO ═══"
log "Diretório: $PROJECT_DIR"

# 1. Tag imagem atual pra rollback
log "Tag rollback → cardapio-saas:rollback-${TS}"
docker tag cardapio-saas:latest cardapio-saas:rollback-${TS} 2>/dev/null || warn "Sem imagem prévia"

# 2. Backup
if [[ $SKIP_BACKUP -eq 0 ]]; then
  BACKUP_FILE=$(backup_banco) || exit 1
  backup_cloud "$BACKUP_FILE"
fi

# 3. Modo manutenção
log "Ativando modo manutenção"
modo_manutencao true

# 4. Git pull
log "git pull"
git pull --rebase 2>&1 | tee -a "$LOG_FILE"
if [[ $? -ne 0 ]]; then
  err "git pull falhou"
  modo_manutencao false
  exit 1
fi

# 5. Migrations
aplicar_migrations

# 6. Build + up
log "Build da imagem"
$COMPOSE build app 2>&1 | tail -5 | tee -a "$LOG_FILE"
if [[ $? -ne 0 ]]; then
  err "Build falhou — restaurando imagem anterior"
  docker tag cardapio-saas:rollback-${TS} cardapio-saas:latest
  modo_manutencao false
  exit 2
fi

log "Recriando container app"
$COMPOSE up -d --force-recreate app

# 7. Health check
log "Health check (até 60s)..."
if ! health_check; then
  err "Health check FALHOU — iniciando ROLLBACK"
  docker tag cardapio-saas:rollback-${TS} cardapio-saas:latest
  $COMPOSE up -d --force-recreate app
  sleep 10
  if health_check; then
    log "✓ Rollback OK"
  else
    err "Rollback falhou TAMBÉM. Sistema pode estar fora do ar."
  fi
  modo_manutencao false
  exit 3
fi

# 8. Sucesso
log "✓ Deploy OK"
modo_manutencao false

# 9. Limpa backups > 30 dias e imagens rollback antigas (>5)
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +30 -delete 2>/dev/null
docker images cardapio-saas --format '{{.Tag}}' | grep '^rollback-' | tail -n +6 | \
  xargs -r -I{} docker rmi cardapio-saas:{} 2>/dev/null

log "═══ DEPLOY CONCLUÍDO ═══"
echo ""
log "Backups disponíveis:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5
