#!/bin/bash
# Instala o vps-agent como serviço systemd.
# Roda como root, automaticamente reinicia.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="cardapio-vps-agent"

if [[ ! -f "$SCRIPT_DIR/config.json" ]]; then
  echo "✖ config.json não existe — rode 'node setup.js' primeiro"
  exit 1
fi

NODE_BIN=$(command -v node)
if [[ -z "$NODE_BIN" ]]; then
  echo "✖ node não encontrado no PATH"
  exit 1
fi

cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Cardapio SaaS VPS Agent
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${NODE_BIN} ${SCRIPT_DIR}/index.js
Restart=always
RestartSec=5
User=root
StandardOutput=append:${SCRIPT_DIR}/agent.log
StandardError=append:${SCRIPT_DIR}/agent.log
Environment=CARDAPIO_DIR=/opt/cardapio_saas

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME}
sleep 2
systemctl status ${SERVICE_NAME} --no-pager | head -10

echo ""
echo "✓ Instalado. Comandos:"
echo "    Status:       systemctl status ${SERVICE_NAME}"
echo "    Logs:         journalctl -u ${SERVICE_NAME} -f"
echo "    Parar:        systemctl stop ${SERVICE_NAME}"
echo "    Desinstalar:  systemctl disable --now ${SERVICE_NAME} && rm /etc/systemd/system/${SERVICE_NAME}.service"
