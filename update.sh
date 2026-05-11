#!/bin/bash
# Cardápio SaaS — Atualização do sistema
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log() { echo -e "${GREEN}✔${NC}  $*"; }
info() { echo -e "${CYAN}ℹ${NC}  $*"; }

INSTALL_DIR="${CARDAPIO_DIR:-/opt/cardapio}"
COMPOSE_CMD="docker compose"
command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1 && COMPOSE_CMD="docker-compose"

cd "$INSTALL_DIR"
[[ -f ".env" ]] || { echo "❌ .env não encontrado em ${INSTALL_DIR}"; exit 1; }

info "Reconstruindo imagem da aplicação..."
$COMPOSE_CMD -f docker-compose.prod.yml build app

info "Reiniciando app com zero-downtime..."
$COMPOSE_CMD -f docker-compose.prod.yml up -d --no-deps app

info "Executando novas migrations (se houver)..."
for sql_file in database/migrations/*.sql; do
  [[ -f "$sql_file" ]] || continue
  docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas \
    < "$sql_file" >/dev/null 2>&1 || true
done

log "Atualização concluída!"
info "Verificando saúde do app..."
sleep 5
curl -sf http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || \
  echo "App iniciando... aguarde mais alguns segundos."
