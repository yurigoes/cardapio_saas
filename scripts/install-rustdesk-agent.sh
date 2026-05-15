#!/usr/bin/env bash
# install-rustdesk-agent.sh
# Instala cliente RustDesk no Linux (Debian/Ubuntu) já apontado para
# o relay da Three Digital + senha permanente fornecida.
#
# Uso (passar relay + key + senha + opcional auto-aceite):
#   sudo bash install-rustdesk-agent.sh \
#     --relay 1.2.3.4 \
#     --key   "AAAA...=" \
#     --pass  "senha-gerada-no-painel" \
#     [--auto-aceite]
#
# Ou via env vars: RUSTDESK_RELAY, RUSTDESK_KEY, RUSTDESK_PASS
#
# O agente será instalado como serviço systemd e sobe no boot.

set -euo pipefail

RELAY="${RUSTDESK_RELAY:-}"
KEY="${RUSTDESK_KEY:-}"
PASS="${RUSTDESK_PASS:-}"
AUTO_ACEITE="${RUSTDESK_AUTO_ACEITE:-N}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --relay)         RELAY="$2"; shift 2 ;;
    --key)           KEY="$2";   shift 2 ;;
    --pass)          PASS="$2";  shift 2 ;;
    --auto-aceite)   AUTO_ACEITE="Y"; shift ;;
    *) echo "Arg desconhecido: $1"; exit 1 ;;
  esac
done

if [[ "$EUID" -ne 0 ]]; then
  echo "✖ precisa rodar com sudo"; exit 1
fi
if [[ -z "$RELAY" || -z "$KEY" || -z "$PASS" ]]; then
  echo "✖ obrigatórios: --relay --key --pass"
  echo "  Pegue esses valores em /painel/maquinas → 'Configurar suporte remoto'"
  exit 1
fi

ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  amd64)  RUSTDESK_ARCH="x86_64" ;;
  arm64)  RUSTDESK_ARCH="aarch64" ;;
  *) echo "✖ arquitetura $ARCH não suportada"; exit 1 ;;
esac

TMPDEB="/tmp/rustdesk-agent.deb"
URL="https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.0-${RUSTDESK_ARCH}.deb"

echo "→ baixando RustDesk para $RUSTDESK_ARCH..."
curl -fsSL "$URL" -o "$TMPDEB"

echo "→ instalando..."
DEBIAN_FRONTEND=noninteractive apt-get install -y "$TMPDEB" >/dev/null

# Configura RustDesk
RD_CONFIG_DIR="/root/.config/rustdesk"
mkdir -p "$RD_CONFIG_DIR"

cat > "$RD_CONFIG_DIR/RustDesk2.toml" <<EOF
rendezvous_server = "$RELAY:21116"
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = "$RELAY"
key = "$KEY"
relay-server = "$RELAY"
api-server = ""
EOF

# Configura senha permanente (passa via cli)
rustdesk --password "$PASS" || true

# Modo auto-aceitar (se solicitado)
if [[ "$AUTO_ACEITE" == "Y" ]]; then
  cat >> "$RD_CONFIG_DIR/RustDesk2.toml" <<EOF

[options]
allow-remote-config-modification = "Y"
approve-mode = "password"
verification-method = "use-permanent-password"
EOF
fi

# Garante serviço habilitado
systemctl enable --now rustdesk 2>/dev/null || true

# Mostra ID do RustDesk gerado
sleep 3
RD_ID="$(rustdesk --get-id 2>/dev/null || true)"

echo ""
echo "✓ RustDesk Agent instalado"
echo "  Relay:  $RELAY"
echo "  ID:     ${RD_ID:-(rode 'rustdesk --get-id' depois)}"
echo "  Senha:  configurada (a que você passou)"
echo ""
echo "VOLTE AGORA NO PAINEL e cole o ID acima no campo 'rustdesk_id' do agente."
