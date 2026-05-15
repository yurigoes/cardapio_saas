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

# Desativa set -e localmente pra capturar erros sem matar script
set +e

NODE_SCRIPT='const wp=require("web-push");const k=wp.generateVAPIDKeys();console.log("PUB="+k.publicKey);console.log("PRIV="+k.privateKey);'

# Tenta 1: dentro do container app (web-push já em deps)
echo "  tentativa 1: docker exec cardapio_app..."
KEYS=$(docker exec cardapio_app node -e "$NODE_SCRIPT" 2>&1)
RC=$?
echo "  exit code: $RC"

if [[ $RC -ne 0 ]] || [[ "$KEYS" != *"PUB="* ]]; then
  echo "  saída anterior: $KEYS" | head -3
  echo "  tentativa 2: node no host..."
  KEYS=$(cd "$PROJETO_DIR" && node -e "$NODE_SCRIPT" 2>&1)
  RC=$?
  echo "  exit code: $RC"
fi

if [[ $RC -ne 0 ]] || [[ "$KEYS" != *"PUB="* ]]; then
  echo "  tentativa 3: npx --yes web-push..."
  KEYS=$(npx --yes web-push generate-vapid-keys 2>&1)
  RC=$?
  echo "  exit code: $RC"
fi

set -e

PUB=$(echo "$KEYS"  | grep -oP '(PUB=|Public Key:)\s*\K\S+'  | head -1 | tr -d '\r')
PRIV=$(echo "$KEYS" | grep -oP '(PRIV=|Private Key:)\s*\K\S+' | head -1 | tr -d '\r')

# Fallback alternativo: linha logo após "Public Key:"
if [[ -z "$PUB" ]]; then
  PUB=$(echo "$KEYS"  | grep -A1 "Public Key:"  | tail -1 | tr -d '[:space:]')
fi
if [[ -z "$PRIV" ]]; then
  PRIV=$(echo "$KEYS" | grep -A1 "Private Key:" | tail -1 | tr -d '[:space:]')
fi

echo ""
if [[ -z "$PUB" || -z "$PRIV" ]]; then
  echo "✖ falha ao gerar chaves. Output bruto:"
  echo "----------------------------------"
  echo "$KEYS"
  echo "----------------------------------"
  echo ""
  echo "Diagnóstico:"
  echo "  docker ps | grep cardapio_app   # container está rodando?"
  echo "  which node                      # node existe no host?"
  echo "  which npx                       # npx existe no host?"
  exit 1
fi
echo "  ✓ chaves geradas"

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
