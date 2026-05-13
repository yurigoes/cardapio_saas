#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Cardápio SaaS — Instalador VPS
#  Execute com: bash install.sh
#  Requerimentos: Ubuntu 22+ / Debian 12+, Docker 24+, 2GB RAM
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Cores ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}✔${NC}  $*"; }
info() { echo -e "${CYAN}ℹ${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }
ask()  { echo -e "${BOLD}${YELLOW}?${NC}  $*"; }

INSTALL_DIR="${CARDAPIO_DIR:-/opt/cardapio}"

# ── Banner ─────────────────────────────────────────────────────
clear
echo -e "${CYAN}"
cat << 'EOF'
  ╔══════════════════════════════════════════════════════╗
  ║       C A R D Á P I O   S A A S                     ║
  ║       Instalador VPS — Configuração Completa         ║
  ╚══════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo -e "  Serviços que serão instalados:"
echo -e "  ${GREEN}●${NC} App Next.js (cardápio + painel admin)"
echo -e "  ${GREEN}●${NC} PostgreSQL 16"
echo -e "  ${GREEN}●${NC} Redis 7"
echo -e "  ${GREEN}●${NC} MinIO (armazenamento de imagens)"
echo -e "  ${GREEN}●${NC} Evolution API v2.2.3 (WhatsApp)"
echo -e "  ${GREEN}●${NC} N8N (automações de aniversário/fidelidade)"
echo -e "  ${GREEN}●${NC} Traefik (proxy reverso + SSL automático)"
echo ""

# ── Verifica requisitos ────────────────────────────────────────
check_requirements() {
  info "Verificando requisitos..."

  command -v docker >/dev/null 2>&1 || \
    err "Docker não encontrado. Instale com: curl -fsSL https://get.docker.com | sh"

  DOCKER_VERSION=$(docker --version | grep -oP '\d+' | head -1)
  [[ "$DOCKER_VERSION" -lt 24 ]] && \
    err "Docker 24+ necessário (instalado: $DOCKER_VERSION)"

  # docker compose v2 (plugin) ou v1
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    err "docker-compose não encontrado. Instale: apt install docker-compose-plugin"
  fi

  FREE_RAM=$(free -m | awk '/^Mem:/{print $7}')
  [[ "$FREE_RAM" -lt 800 ]] && warn "Menos de 800MB de RAM livre. Pode haver lentidão."

  FREE_DISK=$(df -BG / | awk 'NR==2{print $4}' | tr -d G)
  [[ "$FREE_DISK" -lt 10 ]] && \
    err "Espaço insuficiente (mínimo 10GB livres, disponível: ${FREE_DISK}GB)"

  log "Requisitos verificados"
}

# ── Coleta configurações ───────────────────────────────────────
collect_config() {
  echo ""
  echo -e "${BOLD}━━━ CONFIGURAÇÃO DE DOMÍNIO ━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  ask "Domínio principal do sistema (ex: cardapio.suaempresa.com.br):"
  read -r DOMAIN
  [[ -z "$DOMAIN" ]] && err "Domínio não pode ser vazio"
  DOMAIN="${DOMAIN,,}"  # lowercase

  ask "E-mail para certificado SSL Let's Encrypt:"
  read -r ACME_EMAIL
  [[ "$ACME_EMAIL" != *"@"* ]] && err "E-mail inválido"

  echo ""
  echo -e "${BOLD}━━━ SENHAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  info "Gerando senhas seguras automaticamente..."
  info "(Pressione Enter para aceitar ou digite a sua própria)"
  echo ""

  GEN_DB=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
  ask "Senha do banco de dados [${GEN_DB}]:"
  read -r INPUT_DB
  DB_PASSWORD="${INPUT_DB:-$GEN_DB}"

  GEN_REDIS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
  ask "Senha do Redis [${GEN_REDIS}]:"
  read -r INPUT_REDIS
  REDIS_PASSWORD="${INPUT_REDIS:-$GEN_REDIS}"

  echo ""
  echo -e "${BOLD}━━━ ADMIN MASTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  ask "E-mail do administrador master:"
  read -r MASTER_EMAIL
  [[ "$MASTER_EMAIL" != *"@"* ]] && err "E-mail inválido"

  ask "Senha do administrador master (mínimo 12 chars):"
  read -rs MASTER_PASSWORD
  echo ""
  [[ ${#MASTER_PASSWORD} -lt 12 ]] && err "Senha muito curta (mínimo 12 caracteres)"

  echo ""
  echo -e "${BOLD}━━━ N8N ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  ask "Usuário do N8N [admin]:"
  read -r N8N_USER
  N8N_USER="${N8N_USER:-admin}"

  GEN_N8N=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 24)
  ask "Senha do N8N [${GEN_N8N}]:"
  read -r INPUT_N8N
  N8N_PASSWORD="${INPUT_N8N:-$GEN_N8N}"

  # ── Gera segredos automaticamente ────────────────────────────
  JWT_SECRET=$(openssl rand -hex 64)
  JWT_REFRESH_SECRET=$(openssl rand -hex 64)
  SLAVE_JWT_SECRET=$(openssl rand -hex 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  MINIO_ACCESS_KEY=$(openssl rand -hex 16)
  MINIO_SECRET_KEY=$(openssl rand -hex 24)
  EVOLUTION_API_KEY=$(openssl rand -hex 32)
  N8N_CARDAPIO_API_KEY=$(openssl rand -hex 16)
  EVOLUTION_DB_PASSWORD=$(openssl rand -hex 16)

  # ── Resumo ───────────────────────────────────────────────────
  SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  echo ""
  echo -e "${BOLD}━━━ RESUMO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  Domínio:      ${CYAN}${DOMAIN}${NC}"
  echo -e "  IP do server: ${CYAN}${SERVER_IP}${NC}"
  echo -e "  Admin Master: ${CYAN}${MASTER_EMAIL}${NC}"
  echo -e "  N8N User:     ${CYAN}${N8N_USER}${NC}"
  echo ""
  echo -e "  URLs que serão configuradas:"
  echo -e "  ${GREEN}https://${DOMAIN}${NC}              → App principal"
  echo -e "  ${GREEN}https://s3.${DOMAIN}${NC}           → MinIO (imagens)"
  echo -e "  ${GREEN}https://minio.${DOMAIN}${NC}        → MinIO Console"
  echo -e "  ${GREEN}https://evolution.${DOMAIN}${NC}    → Evolution API"
  echo -e "  ${GREEN}https://n8n.${DOMAIN}${NC}          → N8N Automações"
  echo ""
  echo -e "${YELLOW}  ⚠  Certifique-se de que os registros DNS estão configurados!${NC}"
  echo -e "  Todos os subdomínios devem apontar para: ${CYAN}${SERVER_IP}${NC}"
  echo ""
  ask "Continuar com a instalação? [s/N]"
  read -r CONFIRM
  [[ "${CONFIRM,,}" != "s" ]] && { info "Instalação cancelada."; exit 0; }
}

# ── Cria estrutura de diretórios ───────────────────────────────
create_dirs() {
  info "Criando estrutura em ${INSTALL_DIR}..."
  mkdir -p "${INSTALL_DIR}"/{infra/traefik/{dynamic,certs},logs,backups}

  # acme.json deve ter permissão 600 (Traefik exige)
  touch "${INSTALL_DIR}/infra/traefik/certs/acme.json"
  chmod 600 "${INSTALL_DIR}/infra/traefik/certs/acme.json"

  log "Diretórios criados"
}

# ── Copia projeto ──────────────────────────────────────────────
copy_project() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
    info "Copiando projeto para ${INSTALL_DIR}..."
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
          --exclude='.claude' --exclude='CREDENCIAIS.txt' \
          "${SCRIPT_DIR}/" "${INSTALL_DIR}/"
    log "Projeto copiado"
  fi
}

# ── Gera .env ──────────────────────────────────────────────────
generate_env() {
  info "Gerando arquivo .env..."

  cat > "${INSTALL_DIR}/.env" << ENV
# ═══════════════════════════════════════════════════
#  Cardápio SaaS — Configuração de Produção
#  Gerado em: $(date '+%Y-%m-%d %H:%M:%S')
#  NÃO compartilhe este arquivo!
# ═══════════════════════════════════════════════════

# Domínio e SSL
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

# Banco de dados (app)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=cardapio_saas
DB_USER=cardapio
DB_PASSWORD=${DB_PASSWORD}
DB_SSL=false
DB_POOL_MAX=20

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_DB=0

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SLAVE_JWT_SECRET=${SLAVE_JWT_SECRET}

# Criptografia
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Admin Master
MASTER_EMAIL=${MASTER_EMAIL}
MASTER_PASSWORD=${MASTER_PASSWORD}

# MinIO — endpoint interno (Docker network) + URL pública
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
MINIO_BUCKET=cardapio
MINIO_PUBLIC_URL=https://s3.${DOMAIN}

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
EVOLUTION_DB_PASSWORD=${EVOLUTION_DB_PASSWORD}

# N8N
N8N_USER=${N8N_USER}
N8N_PASSWORD=${N8N_PASSWORD}
N8N_CARDAPIO_API_KEY=${N8N_CARDAPIO_API_KEY}

# App público
NEXT_PUBLIC_BASE_DOMAIN=${DOMAIN}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
NODE_ENV=production
ENV

  chmod 600 "${INSTALL_DIR}/.env"
  log ".env gerado"
}

# ── Salva credenciais ──────────────────────────────────────────
save_credentials() {
  CRED_FILE="${INSTALL_DIR}/CREDENCIAIS.txt"
  cat > "$CRED_FILE" << CRED
╔══════════════════════════════════════════════════════╗
║       CARDÁPIO SAAS — CREDENCIAIS DE ACESSO          ║
║       Gerado em: $(date '+%Y-%m-%d %H:%M:%S')        ║
╚══════════════════════════════════════════════════════╝

⚠  GUARDE ESTE ARQUIVO EM LOCAL SEGURO E DELETE DA VPS APÓS SALVAR!

━━━ ACESSOS PRINCIPAIS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  App:              https://${DOMAIN}
  Admin Master:     ${MASTER_EMAIL}
  Senha Master:     ${MASTER_PASSWORD}

━━━ SERVIÇOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  MinIO Console:    https://minio.${DOMAIN}
  MinIO Access Key: ${MINIO_ACCESS_KEY}
  MinIO Secret Key: ${MINIO_SECRET_KEY}

  N8N:              https://n8n.${DOMAIN}
  N8N Usuário:      ${N8N_USER}
  N8N Senha:        ${N8N_PASSWORD}

  Evolution API:    https://evolution.${DOMAIN}
  Evolution Key:    ${EVOLUTION_API_KEY}

━━━ BANCO DE DADOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Host:      postgres (interno Docker)
  DB App:    cardapio_saas / usuário: cardapio
  DB Evol:   evolution / usuário: evolution
  Senha:     ${DB_PASSWORD}

━━━ INTEGRAÇÃO SLAVE (RESTAURANTES) ━━━━━━━━━━━━━━━━━━

  URL da nuvem:   https://${DOMAIN}
  (A slave_key é gerada por empresa no painel admin → Integrações)

CRED

  chmod 600 "$CRED_FILE"
  log "Credenciais salvas em ${CRED_FILE}"
}

# ── Aguarda serviço ficar saudável ─────────────────────────────
wait_healthy() {
  local container="$1"
  local max_wait="${2:-60}"
  info "Aguardando ${container} ficar saudável..."
  for i in $(seq 1 $max_wait); do
    STATUS=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    [[ "$STATUS" == "healthy" ]] && return 0
    [[ "$STATUS" == "unknown" ]] && sleep 1 && continue
    sleep 2
  done
  warn "${container} demorou para iniciar — continuando mesmo assim"
}

# ── Configura PostgreSQL (md5 + banco evolution) ───────────────
setup_postgres() {
  wait_healthy "cardapio_postgres" 60

  info "Configurando PostgreSQL (autenticação MD5 + banco Evolution)..."

  # Força password_encryption=md5 (compatibilidade com Prisma do Evolution)
  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
    "ALTER SYSTEM SET password_encryption = 'md5';" >/dev/null 2>&1 || true
  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
    "SELECT pg_reload_conf();" >/dev/null 2>&1 || true

  # Re-define senha com MD5
  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
    "SET password_encryption='md5'; ALTER USER cardapio WITH PASSWORD '${DB_PASSWORD}';" \
    >/dev/null 2>&1 || true

  # Atualiza pg_hba.conf para aceitar md5 de redes Docker
  docker exec cardapio_postgres bash -c "
    cat > /tmp/pg_hba.conf << 'HBA'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    all             all             172.0.0.0/8             md5
host    all             all             10.0.0.0/8              md5
host    all             all             192.168.0.0/16          md5
HBA
    cp /tmp/pg_hba.conf /var/lib/postgresql/data/pgdata/pg_hba.conf
    chown postgres:postgres /var/lib/postgresql/data/pgdata/pg_hba.conf
    chmod 600 /var/lib/postgresql/data/pgdata/pg_hba.conf
  " >/dev/null 2>&1 || true

  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
    "SELECT pg_reload_conf();" >/dev/null 2>&1 || true

  # Banco dedicado para Evolution API
  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
    "CREATE DATABASE evolution OWNER cardapio;" >/dev/null 2>&1 || true

  # Usuário dedicado para Evolution API (senha MD5)
  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
    "SET password_encryption='md5';
     CREATE USER evolution WITH PASSWORD '${EVOLUTION_DB_PASSWORD}';
     GRANT ALL PRIVILEGES ON DATABASE evolution TO evolution;" >/dev/null 2>&1 || true
  docker exec cardapio_postgres psql -U cardapio -d evolution -c \
    "GRANT ALL ON SCHEMA public TO evolution;
     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO evolution;" \
    >/dev/null 2>&1 || true

  log "PostgreSQL configurado (MD5 + banco evolution)"
}

# ── Configura MinIO ────────────────────────────────────────────
setup_minio() {
  info "Aguardando MinIO iniciar..."
  for i in $(seq 1 30); do
    if docker exec minio curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  info "Criando bucket '${MINIO_BUCKET:-cardapio}' com acesso público de leitura..."
  docker exec minio sh -c "
    mc alias set local http://localhost:9000 '${MINIO_ACCESS_KEY}' '${MINIO_SECRET_KEY}' --quiet 2>/dev/null
    mc mb --ignore-existing local/cardapio 2>/dev/null || true
    mc anonymous set download local/cardapio 2>/dev/null || true
  " || warn "Bucket MinIO — configure manualmente se necessário"

  log "MinIO configurado"
}

# ── Executa migrations ─────────────────────────────────────────
run_migrations() {
  info "Executando migrations do banco de dados..."

  for sql_file in "${INSTALL_DIR}"/database/migrations/*.sql; do
    [[ -f "$sql_file" ]] || continue
    FNAME=$(basename "$sql_file")
    info "  → ${FNAME}"
    docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas \
      < "$sql_file" >/dev/null 2>&1 || \
      warn "  ${FNAME}: avisos (normal se migração já foi aplicada)"
  done

  log "Migrations concluídas"
}

# ── Cria admin master via app ──────────────────────────────────
# Usa pgcrypto (extensão nativa do Postgres) em vez de subir um container
# Node externo só pra gerar hash. Mais rápido, sem dependências, e o
# formato $2a$ gerado pelo pgcrypto é 100% compatível com bcryptjs.
create_master() {
  info "Aguardando app iniciar..."
  for i in $(seq 1 30); do
    if curl -sf --max-time 3 http://localhost:3000/api/health >/dev/null 2>&1; then
      break
    fi
    sleep 3
  done

  info "Criando admin master via pgcrypto..."

  # Email é normalizado pra lowercase pra bater com o login (z.string().email().toLowerCase())
  MASTER_EMAIL_LC="${MASTER_EMAIL,,}"

  # Escapa apóstrofo da senha pra não quebrar o SQL (PostgreSQL: '' = ')
  MASTER_PASSWORD_ESC="${MASTER_PASSWORD//\'/\'\'}"

  if docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL >/dev/null 2>&1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Garante que existe só 1 master e que está consistente
DELETE FROM usuarios WHERE role='master' AND email <> '${MASTER_EMAIL_LC}';

INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, tentativas_login)
VALUES (
  COALESCE(
    (SELECT id FROM usuarios WHERE email='${MASTER_EMAIL_LC}'),
    gen_random_uuid()
  ),
  'Master Admin',
  '${MASTER_EMAIL_LC}',
  crypt('${MASTER_PASSWORD_ESC}', gen_salt('bf', 12)),
  'master',
  true,
  0
)
ON CONFLICT (email) DO UPDATE
  SET senha_hash       = crypt('${MASTER_PASSWORD_ESC}', gen_salt('bf', 12)),
      role             = 'master',
      ativo            = true,
      deleted_at       = NULL,
      bloqueado_ate    = NULL,
      tentativas_login = 0;
SQL
  then
    # Verifica se realmente bate
    OK=$(docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas -tAc \
      "SELECT (senha_hash = crypt('${MASTER_PASSWORD_ESC}', senha_hash)) FROM usuarios WHERE email='${MASTER_EMAIL_LC}';" 2>/dev/null)
    if [[ "$OK" == "t" ]]; then
      log "Admin master criado: ${MASTER_EMAIL_LC}"
    else
      warn "Master inserido mas senha não confere — confira manualmente"
    fi
  else
    warn "Falha ao criar admin master via SQL"
    warn "Execute manualmente após a instalação:"
    warn "  docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \\"
    warn "    \"INSERT INTO usuarios (id,nome,email,senha_hash,role,ativo)"
    warn "     VALUES (gen_random_uuid(),'Master','${MASTER_EMAIL_LC}',"
    warn "             crypt('${MASTER_PASSWORD}', gen_salt('bf', 12)),'master',true);\""
  fi
}

# ── Sobe serviços ──────────────────────────────────────────────
start_services() {
  cd "${INSTALL_DIR}"

  info "Construindo imagem do app (pode demorar 3-5 minutos)..."
  $COMPOSE_CMD -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -3

  info "Iniciando todos os serviços..."
  $COMPOSE_CMD -f docker-compose.prod.yml up -d

  log "Serviços iniciados"
}

# ── Health check final ─────────────────────────────────────────
health_check() {
  info "Verificando saúde dos serviços (aguarde 45s)..."
  sleep 45

  declare -A CHECKS=(
    ["App"]="http://localhost:3000/api/health"
    ["Evolution"]="http://localhost:8080/"
    ["N8N"]="http://localhost:5678/healthz"
    ["MinIO"]="http://localhost:9000/minio/health/live"
  )

  for name in "${!CHECKS[@]}"; do
    URL="${CHECKS[$name]}"
    if curl -sf --max-time 5 "$URL" >/dev/null 2>&1; then
      log "$name: ${GREEN}OK${NC}"
    else
      warn "$name: ainda iniciando ou com problema"
    fi
  done
}

# ── Resumo final ───────────────────────────────────────────────
show_summary() {
  echo ""
  echo -e "${GREEN}"
  cat << 'EOF'
  ╔══════════════════════════════════════════════════════╗
  ║   ✔  INSTALAÇÃO CONCLUÍDA COM SUCESSO!               ║
  ╚══════════════════════════════════════════════════════╝
EOF
  echo -e "${NC}"

  echo -e "  ${BOLD}URLs do sistema:${NC}"
  echo -e "  ${CYAN}https://${DOMAIN}${NC}              → App principal"
  echo -e "  ${CYAN}https://s3.${DOMAIN}${NC}           → MinIO S3 (imagens)"
  echo -e "  ${CYAN}https://minio.${DOMAIN}${NC}        → MinIO Console"
  echo -e "  ${CYAN}https://evolution.${DOMAIN}${NC}    → WhatsApp API"
  echo -e "  ${CYAN}https://n8n.${DOMAIN}${NC}          → Automações"
  echo ""
  echo -e "  ${BOLD}Credenciais completas em:${NC}"
  echo -e "  ${YELLOW}${INSTALL_DIR}/CREDENCIAIS.txt${NC}"
  echo ""
  echo -e "  ${BOLD}Comandos úteis:${NC}"
  echo -e "  Logs app:   ${CYAN}docker logs cardapio_app -f${NC}"
  echo -e "  Atualizar:  ${CYAN}cd ${INSTALL_DIR} && bash update.sh${NC}"
  echo -e "  Backup DB:  ${CYAN}docker exec cardapio_postgres pg_dump -U cardapio cardapio_saas | gzip > backup.sql.gz${NC}"
  echo ""
  echo -e "  ${YELLOW}⚠  Para o Slave Windows (impressão térmica):${NC}"
  echo -e "  Download em: ${CYAN}https://${DOMAIN}/downloads/slave-setup.exe${NC}"
  echo ""
}

# ── Main ───────────────────────────────────────────────────────
main() {
  check_requirements
  collect_config
  create_dirs
  copy_project
  generate_env
  save_credentials
  start_services
  setup_postgres
  run_migrations
  setup_minio
  create_master
  health_check
  show_summary
}

main "$@"
