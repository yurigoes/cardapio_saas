#!/usr/bin/env bash
# install-rustdesk-server.sh
# Instala RustDesk Server (hbbs + hbbr) self-hosted na VPS.
# Sobe portas 21115-21119. Salva chave pública pra distribuir no agente.
#
# Uso:
#   sudo bash scripts/install-rustdesk-server.sh [IP_PUBLICO_VPS]
#   sudo bash scripts/install-rustdesk-server.sh --uninstall

set -euo pipefail

PROJETO_DIR="${PROJETO_DIR:-/opt/cardapio_saas}"
RUSTDESK_DIR="$PROJETO_DIR/rustdesk"

if [[ "${1:-}" == "--uninstall" ]]; then
  cd "$RUSTDESK_DIR" 2>/dev/null && docker compose -f docker-compose.rustdesk.yml down -v || true
  echo "✓ RustDesk Server removido"
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "✖ precisa rodar com sudo"
  exit 1
fi

# Descobre IP público se não passou
RELAY_HOST="${1:-}"
if [[ -z "$RELAY_HOST" ]]; then
  RELAY_HOST="$(curl -fsS ifconfig.me 2>/dev/null || curl -fsS ipinfo.io/ip 2>/dev/null || echo '')"
  if [[ -z "$RELAY_HOST" ]]; then
    echo "✖ não consegui detectar IP público — passe como argumento:"
    echo "  sudo bash $0 SEU.IP.AQUI"
    exit 1
  fi
fi

echo "→ Relay host: $RELAY_HOST"

mkdir -p "$RUSTDESK_DIR/data"
cd "$RUSTDESK_DIR"

# Salva env pra docker compose
cat > .env <<EOF
RUSTDESK_RELAY_HOST=$RELAY_HOST
EOF

# Sobe stack
docker compose -f docker-compose.rustdesk.yml up -d
sleep 4

# Aguarda gerar a chave pública (até 30s)
echo "→ Aguardando hbbs gerar id_ed25519.pub..."
for i in {1..30}; do
  if [[ -f "$RUSTDESK_DIR/data/id_ed25519.pub" ]]; then break; fi
  sleep 1
done

if [[ ! -f "$RUSTDESK_DIR/data/id_ed25519.pub" ]]; then
  echo "✖ chave pública não gerada — verifique 'docker logs rustdesk-hbbs'"
  exit 1
fi

PUB_KEY="$(cat "$RUSTDESK_DIR/data/id_ed25519.pub")"

# Salva no .env do projeto pra API saber
ENV_FILE="$PROJETO_DIR/.env"
sed -i '/^RUSTDESK_RELAY_HOST=/d'  "$ENV_FILE" 2>/dev/null || true
sed -i '/^RUSTDESK_PUBLIC_KEY=/d'  "$ENV_FILE" 2>/dev/null || true
{
  echo ""
  echo "# RustDesk Server (gerado por install-rustdesk-server.sh)"
  echo "RUSTDESK_RELAY_HOST=$RELAY_HOST"
  echo "RUSTDESK_PUBLIC_KEY=$PUB_KEY"
} >> "$ENV_FILE"

echo ""
echo "✓ RustDesk Server rodando"
echo "  Relay:       $RELAY_HOST"
echo "  Chave pub.:  $PUB_KEY"
echo ""
echo "Portas a liberar no firewall:"
echo "  ufw allow 21115:21119/tcp"
echo "  ufw allow 21116/udp"
echo ""
echo "Config gravada em $ENV_FILE."
echo "Reinicie o cardapio app:  docker compose restart app"
echo ""
echo "Cliente RustDesk no agente:"
echo "  ID Server:   $RELAY_HOST"
echo "  Relay:       $RELAY_HOST"
echo "  Key:         $PUB_KEY"
