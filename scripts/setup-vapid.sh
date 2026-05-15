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

# Usa só crypto nativo do Node (não precisa web-push instalado).
# VAPID = ECDSA P-256, geramos via crypto.generateKeyPairSync.
read -r -d '' NODE_SCRIPT <<'JS' || true
const c = require('crypto');
const { publicKey, privateKey } = c.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwkPub  = publicKey.export({ format: 'jwk' });
const jwkPriv = privateKey.export({ format: 'jwk' });
const x = Buffer.from(jwkPub.x, 'base64url');
const y = Buffer.from(jwkPub.y, 'base64url');
const pub = Buffer.concat([Buffer.from([0x04]), x, y]);
const priv = Buffer.from(jwkPriv.d, 'base64url');
console.log('PUB=' + pub.toString('base64url'));
console.log('PRIV=' + priv.toString('base64url'));
JS

set +e

# Tenta 1: docker exec (mais previsível)
echo "  tentativa 1: docker exec cardapio_app..."
KEYS=$(docker exec cardapio_app node -e "$NODE_SCRIPT" 2>&1)
RC=$?

# Tenta 2: node no host
if [[ $RC -ne 0 ]] || [[ "$KEYS" != *"PUB="* ]]; then
  echo "  tentativa 1 falhou (rc=$RC), tentando node no host..."
  if command -v node >/dev/null 2>&1; then
    KEYS=$(node -e "$NODE_SCRIPT" 2>&1)
    RC=$?
  else
    echo "  node não está instalado no host"
  fi
fi

set -e

PUB=$(echo "$KEYS"  | grep -oP '^PUB=\K.*'  | head -1 | tr -d '\r')
PRIV=$(echo "$KEYS" | grep -oP '^PRIV=\K.*' | head -1 | tr -d '\r')

if [[ -z "$PUB" || -z "$PRIV" ]]; then
  echo "✖ falha ao gerar chaves. Output bruto:"
  echo "----------------------------------"
  echo "$KEYS"
  echo "----------------------------------"
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
