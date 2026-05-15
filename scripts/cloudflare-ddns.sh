#!/usr/bin/env bash
# cloudflare-ddns.sh
# Atualiza/cria A record na Cloudflare apontando pra IP público atual.
# Idempotente: cria se não existe, atualiza se já existe.
#
# Uso interativo (pede env file):
#   sudo bash cloudflare-ddns.sh /etc/cloudflare-ddns-meurecord.env
#
# Uso direto:
#   CF_API_TOKEN=xxx CF_ZONE_NAME=ex.com.br CF_RECORD_NAME=sub.ex.com.br \
#     bash cloudflare-ddns.sh
#
# Env file format:
#   CF_API_TOKEN="..."
#   CF_ZONE_NAME="dominio.com.br"
#   CF_RECORD_NAME="sub.dominio.com.br"
#   CF_PROXIED="false"   # opcional, default false (RustDesk/SSH/etc)
#
# Pra rodar como cron a cada 5min:
#   */5 * * * * root /usr/local/bin/cloudflare-ddns.sh /etc/cf-ddns-X.env >> /var/log/cf-ddns.log 2>&1

set -euo pipefail

ENV_FILE="${1:-}"
if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
fi

: "${CF_API_TOKEN:?CF_API_TOKEN obrigatório}"
: "${CF_ZONE_NAME:?CF_ZONE_NAME obrigatório}"
: "${CF_RECORD_NAME:?CF_RECORD_NAME obrigatório}"
PROXIED="${CF_PROXIED:-false}"

IP=$(curl -4 -fsS ifconfig.me 2>/dev/null || curl -4 -fsS ipinfo.io/ip)
if [[ -z "$IP" ]]; then
  echo "[$(date -Iseconds)] ✖ não consegui detectar IP público"
  exit 1
fi

ZONE_ID=$(curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=$CF_ZONE_NAME" \
  | grep -oP '"id":"\K[^"]+' | head -1)
if [[ -z "$ZONE_ID" ]]; then
  echo "[$(date -Iseconds)] ✖ zone não encontrada: $CF_ZONE_NAME"
  exit 1
fi

RECORD_ID=$(curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$CF_RECORD_NAME&type=A" \
  | grep -oP '"id":"\K[^"]+' | head -1)

PAYLOAD="{\"type\":\"A\",\"name\":\"$CF_RECORD_NAME\",\"content\":\"$IP\",\"ttl\":120,\"proxied\":$PROXIED}"

if [[ -z "$RECORD_ID" ]]; then
  curl -fsS -X POST \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" > /dev/null
  echo "[$(date -Iseconds)] CRIADO: $CF_RECORD_NAME → $IP (proxied=$PROXIED)"
else
  # Verifica IP atual antes de atualizar — evita PUT desnecessário
  ATUAL=$(curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
    | grep -oP '"content":"\K[^"]+' | head -1)
  if [[ "$ATUAL" == "$IP" ]]; then
    echo "[$(date -Iseconds)] OK (sem mudança): $CF_RECORD_NAME = $IP"
    exit 0
  fi
  curl -fsS -X PUT \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" > /dev/null
  echo "[$(date -Iseconds)] ATUALIZADO: $CF_RECORD_NAME $ATUAL → $IP"
fi
