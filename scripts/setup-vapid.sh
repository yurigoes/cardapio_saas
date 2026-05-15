#!/usr/bin/env bash
# setup-vapid.sh
# Gera chaves VAPID e adiciona ao .env do projeto.
# Necessário pra Web Push (notificações de pedido).

set -euo pipefail

PROJETO_DIR="${PROJETO_DIR:-/opt/cardapio_saas}"
ENV_FILE="$PROJETO_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✖ .env não encontrado em $ENV_FILE"
  exit 1
fi

# Já tem chaves?
if grep -q '^VAPID_PUBLIC_KEY=' "$ENV_FILE" && grep -q '^VAPID_PRIVATE_KEY=' "$ENV_FILE"; then
  if [[ "${1:-}" != "--force" ]]; then
    echo "✓ VAPID já configurado em $ENV_FILE"
    echo "  (use --force pra regenerar — vai invalidar todas subscriptions existentes)"
    grep '^VAPID_PUBLIC_KEY=' "$ENV_FILE"
    exit 0
  fi
fi

echo "→ Gerando chaves VAPID..."

# Usa node direto dentro do container (web-push já está em deps).
# Se container está parado/reiniciando, tenta no host.
NODE_SCRIPT='const wp=require("web-push");const k=wp.generateVAPIDKeys();console.log("PUB="+k.publicKey);console.log("PRIV="+k.privateKey);'

KEYS=$(docker exec cardapio_app node -e "$NODE_SCRIPT" 2>&1)
if [[ $? -ne 0 ]] || [[ "$KEYS" != *"PUB="* ]]; then
  echo "→ container indisponível, tentando no host..."
  KEYS=$(cd "$PROJETO_DIR" && node -e "$NODE_SCRIPT" 2>&1)
fi

PUB=$(echo "$KEYS"  | grep -oP '^PUB=\K.*'  | head -1 | tr -d '\r')
PRIV=$(echo "$KEYS" | grep -oP '^PRIV=\K.*' | head -1 | tr -d '\r')

if [[ -z "$PUB" || -z "$PRIV" ]]; then
  echo "✖ falha ao gerar chaves. Output bruto:"
  echo "$KEYS"
  echo ""
  echo "Tente manualmente:"
  echo "  docker exec cardapio_app node -e '$NODE_SCRIPT'"
  exit 1
fi

# Remove linhas antigas se houver
sed -i '/^VAPID_PUBLIC_KEY=/d'  "$ENV_FILE"
sed -i '/^VAPID_PRIVATE_KEY=/d' "$ENV_FILE"
sed -i '/^VAPID_EMAIL=/d'       "$ENV_FILE"

# Append novas
{
  echo ""
  echo "# Web Push VAPID (gerado por setup-vapid.sh)"
  echo "VAPID_PUBLIC_KEY=$PUB"
  echo "VAPID_PRIVATE_KEY=$PRIV"
  echo "VAPID_EMAIL=mailto:digitalvendasthree@gmail.com"
} >> "$ENV_FILE"

echo "✓ VAPID configurado"
echo "  Public:  $PUB"
echo ""
echo "Reinicie o app pra aplicar:"
echo "  docker compose -f docker-compose.prod.yml up -d --force-recreate app"
