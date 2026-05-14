#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-to-r2.sh — backup do Postgres + upload pra Cloudflare R2 (ou S3 compat)
#
# Uso:
#   ./scripts/backup-to-r2.sh           # roda backup completo
#   ./scripts/backup-to-r2.sh --check   # só verifica config (sem rodar)
#
# Pré-requisitos na VPS:
#   - rclone instalado (apt install rclone)
#   - remote 'r2' configurado em ~/.config/rclone/rclone.conf
#       OU vars de ambiente RCLONE_CONFIG_R2_*
#   - docker rodando com container cardapio_postgres
#
# Variáveis de ambiente (em .env ou exportadas):
#   BACKUP_R2_REMOTE       nome do remote rclone   (default: "r2")
#   BACKUP_R2_BUCKET       bucket R2               (obrigatório)
#   BACKUP_R2_PATH         prefixo dentro bucket   (default: "cardapio-saas/db")
#   BACKUP_RETENTION_DAYS  dias pra manter         (default: 30)
#   POSTGRES_CONTAINER     nome container postgres (default: "cardapio_postgres")
#   POSTGRES_USER          user postgres           (default: "cardapio")
#
# Saída no final: JSON com {ok,arquivo,tamanho_mb,upload_ms} ou {ok:false,erro}
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Carrega .env se existir
ENV_FILE="${ENV_FILE:-/opt/cardapio_saas/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

REMOTE="${BACKUP_R2_REMOTE:-r2}"
BUCKET="${BACKUP_R2_BUCKET:-}"
PREFIX="${BACKUP_R2_PATH:-cardapio-saas/db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PG_CONTAINER="${POSTGRES_CONTAINER:-cardapio_postgres}"
PG_USER="${POSTGRES_USER:-cardapio}"

CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then CHECK_ONLY=1; fi

# ─── Validações ──────────────────────────────────────────────────────────────
fail() {
  printf '{"ok":false,"erro":%s}\n' "$(printf '%s' "$1" | jq -Rs . 2>/dev/null || printf '"%s"' "$1")"
  exit 1
}

command -v rclone >/dev/null 2>&1 || fail "rclone não instalado (apt install rclone)"
command -v docker >/dev/null 2>&1 || fail "docker não disponível"
command -v gzip   >/dev/null 2>&1 || fail "gzip não disponível"

[[ -z "$BUCKET" ]] && fail "BACKUP_R2_BUCKET não definida no .env"

# Verifica que remote existe no rclone
if ! rclone listremotes 2>/dev/null | grep -qx "${REMOTE}:"; then
  fail "remote rclone '${REMOTE}:' não configurado. Rode: rclone config"
fi

# Verifica acesso ao bucket
if ! rclone lsd "${REMOTE}:${BUCKET}" >/dev/null 2>&1; then
  fail "sem acesso ao bucket ${REMOTE}:${BUCKET} (verifique credenciais e nome)"
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  printf '{"ok":true,"mensagem":"config OK","remote":"%s","bucket":"%s","path":"%s","retention_dias":%d}\n' \
    "$REMOTE" "$BUCKET" "$PREFIX" "$RETENTION_DAYS"
  exit 0
fi

# ─── Dump ────────────────────────────────────────────────────────────────────
TS=$(date -u +"%Y%m%d-%H%M%S")
TMP_FILE="/tmp/cardapio-backup-${TS}.sql.gz"

trap 'rm -f "$TMP_FILE"' EXIT

if ! docker exec "$PG_CONTAINER" pg_dumpall -U "$PG_USER" 2>/dev/null | gzip > "$TMP_FILE"; then
  fail "pg_dumpall falhou (container=${PG_CONTAINER}, user=${PG_USER})"
fi

SIZE_BYTES=$(stat -c%s "$TMP_FILE" 2>/dev/null || stat -f%z "$TMP_FILE")
SIZE_MB=$(awk "BEGIN{printf \"%.1f\", $SIZE_BYTES/1024/1024}")

# Sanidade: backup vazio = falhou silenciosamente
if [[ "$SIZE_BYTES" -lt 10000 ]]; then
  fail "backup muito pequeno (${SIZE_BYTES}B) — provavelmente falhou"
fi

# ─── Upload ──────────────────────────────────────────────────────────────────
REMOTE_PATH="${REMOTE}:${BUCKET}/${PREFIX}/$(date -u +%Y/%m)/$(basename "$TMP_FILE")"
T0=$(date +%s%3N 2>/dev/null || python3 -c "import time;print(int(time.time()*1000))")

if ! rclone copyto "$TMP_FILE" "$REMOTE_PATH" --s3-no-check-bucket 2>/dev/null; then
  fail "upload pra R2 falhou (destino: ${REMOTE_PATH})"
fi

T1=$(date +%s%3N 2>/dev/null || python3 -c "import time;print(int(time.time()*1000))")
UPLOAD_MS=$((T1 - T0))

# ─── Retenção ────────────────────────────────────────────────────────────────
# Apaga backups mais velhos que RETENTION_DAYS dias do bucket inteiro
# (--min-age toma "30d" / segundos)
DELETED=0
if rclone delete "${REMOTE}:${BUCKET}/${PREFIX}" \
   --min-age "${RETENTION_DAYS}d" \
   --include "*.sql.gz" 2>/dev/null; then
  # rclone não retorna count facilmente; só sinaliza sucesso
  DELETED=1
fi

# ─── Saída ───────────────────────────────────────────────────────────────────
printf '{"ok":true,"arquivo":"%s","tamanho_mb":%s,"upload_ms":%d,"retencao_dias":%d,"limpeza_ok":%s}\n' \
  "$REMOTE_PATH" "$SIZE_MB" "$UPLOAD_MS" "$RETENTION_DAYS" "$([ $DELETED -eq 1 ] && echo true || echo false)"
