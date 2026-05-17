#!/usr/bin/env bash
# install-email-cron.sh
# Cron que processa fila SMTP a cada 5 minutos.
# Pega pendentes (que falharam ou ainda não foram tentados) e tenta enviar.

set -euo pipefail

PROJETO_DIR="${PROJETO_DIR:-/opt/cardapio_saas}"
ENV_FILE="$PROJETO_DIR/.env"
LOG_FILE="${LOG_FILE:-/var/log/cardapio-email-cron.log}"

if [[ "$EUID" -ne 0 ]]; then
  echo "✖ precisa rodar com sudo"; exit 1
fi

CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$CRON_SECRET" ]]; then
  echo "✖ CRON_SECRET não encontrado em $ENV_FILE"; exit 1
fi

touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

cat > /etc/cron.d/cardapio-email <<EOF
# Processa fila SMTP a cada 5 minutos
*/5 * * * * root curl -fsS -X POST -H 'x-cron-secret: $CRON_SECRET' --max-time 60 http://127.0.0.1:3000/api/cron/enviar-emails >> $LOG_FILE 2>&1
EOF

chmod 644 /etc/cron.d/cardapio-email
systemctl restart cron 2>/dev/null || systemctl restart crond 2>/dev/null || true

echo "✓ Cron instalado em /etc/cron.d/cardapio-email"
echo "  Logs: tail -f $LOG_FILE"
echo "  Próxima execução: a cada 5 min"
echo ""
echo "Testa agora (manual):"
echo "  curl -X POST -H 'x-cron-secret: $CRON_SECRET' http://127.0.0.1:3000/api/cron/enviar-emails"
