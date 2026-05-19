#!/usr/bin/env bash
# install-heartbeat-cron.sh
# Instala cron entry que dispara /api/cron/check-agentes-offline a cada 5min.
#
# Uso:
#   sudo bash scripts/install-heartbeat-cron.sh
#   sudo bash scripts/install-heartbeat-cron.sh --uninstall

set -euo pipefail

PROJETO_DIR="${PROJETO_DIR:-/opt/cardapio_saas}"
ENV_FILE="$PROJETO_DIR/.env"
CRON_FILE="/etc/cron.d/cardapio-heartbeat-check"
LOG_FILE="/var/log/cardapio-heartbeat.log"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$CRON_FILE"
  echo "✓ Cron removido: $CRON_FILE"
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "✖ precisa rodar com sudo"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✖ .env não encontrado em $ENV_FILE"
  exit 1
fi

CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$CRON_SECRET" ]]; then
  echo "✖ CRON_SECRET não encontrado no .env"
  exit 1
fi

# Cria entry — roda a cada 5min
cat > "$CRON_FILE" <<EOF
# Heartbeat check Three Digital
# Marca agentes offline + envia alerta a quem responsável
# Gerado por scripts/install-heartbeat-cron.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root curl -fsS -X POST -H 'x-cron-secret: $CRON_SECRET' http://127.0.0.1:3000/api/cron/check-agentes-offline >> $LOG_FILE 2>&1
EOF
chmod 644 "$CRON_FILE"

touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

echo "✓ Cron instalado: $CRON_FILE"
echo "  Roda a cada 5min"
echo "  Log: $LOG_FILE"
echo ""
echo "Pra desinstalar: sudo bash $0 --uninstall"
