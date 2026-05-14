#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install-backup-cron.sh — instala cron diário do backup-to-r2
#
# Roda backup todo dia às 03:00 UTC.
# Logs em /var/log/cardapio-backup-r2.log
#
# Uso:
#   sudo bash scripts/install-backup-cron.sh
#   sudo bash scripts/install-backup-cron.sh --uninstall
#
# Requer: backup-to-r2.sh já configurado e funcional (rode com --check antes).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJETO_DIR="${PROJETO_DIR:-/opt/cardapio_saas}"
SCRIPT_PATH="$PROJETO_DIR/scripts/backup-to-r2.sh"
LOG_FILE="/var/log/cardapio-backup-r2.log"
CRON_FILE="/etc/cron.d/cardapio-backup-r2"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$CRON_FILE"
  echo "✓ Cron removido: $CRON_FILE"
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "✖ precisa rodar com sudo"
  exit 1
fi

if [[ ! -x "$SCRIPT_PATH" ]]; then
  chmod +x "$SCRIPT_PATH" 2>/dev/null || true
fi

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "✖ script não encontrado: $SCRIPT_PATH"
  exit 1
fi

# Testa config primeiro
echo "→ verificando config (rclone, bucket, .env)..."
if ! "$SCRIPT_PATH" --check >/dev/null 2>&1; then
  echo "✖ backup-to-r2.sh --check falhou. Configure rclone + .env primeiro."
  echo "  Detalhes: $SCRIPT_PATH --check"
  exit 1
fi
echo "✓ config OK"

# Cria cron entry — roda 03:00 UTC todo dia
cat > "$CRON_FILE" <<EOF
# Backup automático Cardápio SaaS → Cloudflare R2
# Gerado por scripts/install-backup-cron.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root $SCRIPT_PATH >> $LOG_FILE 2>&1
EOF
chmod 644 "$CRON_FILE"

# Garante que cron esteja rodando
if systemctl is-active cron >/dev/null 2>&1 || systemctl is-active crond >/dev/null 2>&1; then
  echo "✓ Cron service ativo"
else
  echo "⚠ cron não está ativo — rode: systemctl enable --now cron"
fi

# Cria log file com permissão certa
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

echo "✓ Cron instalado: $CRON_FILE"
echo "  Roda diariamente às 03:00 UTC"
echo "  Log: $LOG_FILE"
echo ""
echo "Pra rodar manualmente agora: $SCRIPT_PATH"
echo "Pra desinstalar:             sudo bash $0 --uninstall"
