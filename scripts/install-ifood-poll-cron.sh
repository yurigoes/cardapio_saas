#!/usr/bin/env bash
# install-ifood-poll-cron.sh
# Instala cron entries que disparam /api/ifood/poll a cada 30 segundos.
#
# Cron normal só vai até granularidade de 1 minuto. Pra rodar a cada 30s
# usamos 2 entries: uma no segundo 0 do minuto, outra no segundo 30
# (via 'sleep 30; curl').
#
# Uso:
#   sudo bash scripts/install-ifood-poll-cron.sh
#   sudo bash scripts/install-ifood-poll-cron.sh --uninstall

set -euo pipefail

PROJETO_DIR="${PROJETO_DIR:-/opt/cardapio_saas}"
ENV_FILE="$PROJETO_DIR/.env"
CRON_FILE="/etc/cron.d/cardapio-ifood-poll"
LOG_FILE="/var/log/cardapio-ifood-poll.log"

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

cat > "$CRON_FILE" <<EOF
# iFood polling Cardápio SaaS — a cada 30s
# Gerado por scripts/install-ifood-poll-cron.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Tick no segundo 0 de cada minuto
* * * * * root curl -fsS -X POST -H 'x-cron-secret: $CRON_SECRET' --max-time 25 http://127.0.0.1:3000/api/ifood/poll >> $LOG_FILE 2>&1

# Tick no segundo 30 de cada minuto (sleep 30 antes)
* * * * * root sleep 30; curl -fsS -X POST -H 'x-cron-secret: $CRON_SECRET' --max-time 25 http://127.0.0.1:3000/api/ifood/poll >> $LOG_FILE 2>&1
EOF
chmod 644 "$CRON_FILE"

touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

# Se já existe cron antigo (1min), remove pra evitar duplicado
if [[ -f /etc/cron.d/cardapio-ifood ]]; then
  rm -f /etc/cron.d/cardapio-ifood
  echo "→ cron antigo /etc/cron.d/cardapio-ifood removido (substituído pela versão 30s)"
fi

echo "✓ Cron instalado: $CRON_FILE"
echo "  Frequência: a cada 30s (2 entries por minuto)"
echo "  Log: $LOG_FILE"
echo ""
echo "Pra desinstalar: sudo bash $0 --uninstall"
