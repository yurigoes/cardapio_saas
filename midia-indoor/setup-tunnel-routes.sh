#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Adiciona rotas no Cloudflare Tunnel EXISTENTE pra:
#   midia.tthreedigital.com.br        → localhost:8085  (Xibo CMS)
#   midiaindoor.tthreedigital.com.br  → localhost:3100  (landing)
#
# Detecta automaticamente se o tunnel é:
#   A) Local (config.yml + cloudflared binário/serviço)  → edita config.yml
#   B) Dashboard-managed (cloudflared via Docker token)  → instrui usar dashboard
#
# Roda na VPS como root. Faz backup do config antes de mexer.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; N='\033[0m'
log() { echo -e "${G}▸${N} $*"; }
warn(){ echo -e "${Y}!${N} $*"; }
err() { echo -e "${R}✗${N} $*"; }

[ "$(id -u)" -eq 0 ] || { err "rode como root"; exit 1; }

DOMAIN="tthreedigital.com.br"
declare -A ROUTES=(
  ["midia.$DOMAIN"]="http://localhost:8085"
  ["midiaindoor.$DOMAIN"]="http://localhost:3100"
)

# ── Detecta cloudflared ──────────────────────────────────────────────
CF_BIN=""
if command -v cloudflared >/dev/null 2>&1; then
  CF_BIN="cloudflared"
fi

# Procura config.yml em locais comuns
CONFIG=""
for p in \
  /etc/cloudflared/config.yml \
  /root/.cloudflared/config.yml \
  "$HOME/.cloudflared/config.yml" \
  /opt/cloudflared/config.yml; do
  [ -f "$p" ] && { CONFIG="$p"; break; }
done

echo
echo "════════════════════════════════════════════════"
echo "  Cloudflare Tunnel — adicionar rotas mídia indoor"
echo "════════════════════════════════════════════════"
echo

# ── Caso A: tunnel LOCAL com config.yml ──────────────────────────────
if [ -n "$CONFIG" ] && [ -n "$CF_BIN" ]; then
  log "Tunnel LOCAL detectado: $CONFIG"
  TUNNEL_NAME=$(grep -E '^tunnel:' "$CONFIG" | awk '{print $2}' | head -1)
  log "Tunnel: ${TUNNEL_NAME:-?}"

  # Backup
  cp "$CONFIG" "$CONFIG.bak-$(date +%s)"
  log "Backup salvo: $CONFIG.bak-*"

  echo
  warn "ADICIONE estas linhas no bloco 'ingress:' do $CONFIG"
  warn "ANTES da regra catch-all (- service: http_status:404):"
  echo
  for host in "${!ROUTES[@]}"; do
    echo "  - hostname: $host"
    echo "    service: ${ROUTES[$host]}"
  done
  echo
  echo "Exemplo de como o ingress deve ficar:"
  echo "  ingress:"
  echo "    - hostname: app.$DOMAIN"
  echo "      service: http://localhost:3000"
  for host in "${!ROUTES[@]}"; do
    echo "    - hostname: $host"
    echo "      service: ${ROUTES[$host]}"
  done
  echo "    - service: http_status:404   # catch-all (mantém por último)"
  echo

  # Cria os DNS records (isso é seguro e automático)
  if [ -n "$TUNNEL_NAME" ]; then
    for host in "${!ROUTES[@]}"; do
      log "Criando rota DNS: $host"
      $CF_BIN tunnel route dns "$TUNNEL_NAME" "$host" 2>&1 | sed 's/^/    /' || \
        warn "  (pode já existir — ok)"
    done
  fi

  echo
  read -p "Já editou o config.yml com as linhas acima? [s/N]: " r
  if [ "$r" = "s" ] || [ "$r" = "S" ]; then
    log "Reiniciando cloudflared…"
    systemctl restart cloudflared 2>/dev/null || \
      docker restart cloudflared 2>/dev/null || \
      warn "Reinicie o cloudflared manualmente"
    log "Pronto! Teste em ~1min:"
    echo "    curl -I https://midia.$DOMAIN"
    echo "    curl -I https://midiaindoor.$DOMAIN"
  else
    warn "Edite o config.yml primeiro, depois reinicie: systemctl restart cloudflared"
  fi
  exit 0
fi

# ── Caso B: tunnel via Docker token (dashboard-managed) ──────────────
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qiE 'cloudflared'; then
  warn "Tunnel rodando via Docker (token/dashboard-managed) detectado."
  echo
  echo "Esse tipo de tunnel se configura pelo DASHBOARD (não por config.yml):"
  echo
  echo "  1. https://one.dash.cloudflare.com → Networks → Tunnels"
  echo "  2. Abra seu tunnel → aba 'Public Hostname' → Add a public hostname"
  echo "  3. Adicione os 2:"
  for host in "${!ROUTES[@]}"; do
    sub="${host%%.$DOMAIN}"
    echo "       • Subdomain: $sub  Domain: $DOMAIN  →  Service: ${ROUTES[$host]}"
  done
  echo "  4. Save (cada um). Propaga em ~1min."
  exit 0
fi

err "Não detectei cloudflared (nem config.yml local, nem container)."
echo "Como seu tunnel está configurado? Me avisa que ajusto o script."
exit 1
