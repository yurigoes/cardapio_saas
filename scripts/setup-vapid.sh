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
KEYS=$(docker exec cardapio_app npx --yes web-push generate-vapid-keys 2>&1 || \
       npx --yes web-push generate-vapid-keys 2>&1)

PUB=$(echo "$KEYS" | grep -i "Public Key:" -A 0 | head -1 | awk '{print $NF}')
PRIV=$(echo "$KEYS" | grep -i "Private Key:" -A 0 | head -1 | awk '{print $NF}')

if [[ -z "$PUB" || -z "$PRIV" ]]; then
  # Fallback: grep próximo ao output
  PUB=$(echo "$KEYS"  | grep -A1 "Public Key:"  | tail -1 | tr -d ' \n\r')
  PRIV=$(echo "$KEYS" | grep -A1 "Private Key:" | tail -1 | tr -d ' \n\r')
fi

if [[ -z "$PUB" || -z "$PRIV" ]]; then
  echo "✖ falha ao parsear chaves. Output bruto:"
  echo "$KEYS"
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
