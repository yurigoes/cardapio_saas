#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AUTO-INSTALADOR da Retaguarda Cardápio SaaS
#
# Roda em qualquer Ubuntu/Debian/Raspberry Pi OS limpo. Instala tudo:
#   - Docker + docker compose v2
#   - cloudflared (binário oficial, opcional se não usar tunnel)
#   - Clona/atualiza o repo cardapio_saas
#   - Provisiona Cloudflare Tunnel próprio pra esta loja
#   - Sobe os containers (nginx-cache + redis + reporter + cloudflared)
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/yurigoes/cardapio_saas/main/retaguarda/install.sh | sudo bash
# OU
#   sudo bash install.sh
#
# Variáveis aceitas via env (pula prompts):
#   CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, BASE_DOMAIN,
#   EMPRESA_SLUG, MASTER_URL, HEARTBEAT_SECRET
# ─────────────────────────────────────────────────────────────────────────────
set -eu

# ── Cores
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'

log() { echo -e "${B}▸${N} $*"; }
ok()  { echo -e "${G}✓${N} $*"; }
err() { echo -e "${R}✗${N} $*" >&2; }
warn() { echo -e "${Y}!${N} $*"; }

# ── Privilégios
if [ "$(id -u)" -ne 0 ]; then
  err "Precisa ser root. Roda com: sudo bash install.sh"
  exit 1
fi

# ── Detecta OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="$ID"
  OS_VER="${VERSION_ID:-?}"
else
  err "Não foi possível detectar SO."
  exit 1
fi

case "$OS_ID" in
  ubuntu|debian|raspbian) ;;
  *) warn "SO '$OS_ID' não testado. Continuar mesmo assim? [s/N]"
     read -r r; [ "$r" = "s" ] || exit 1 ;;
esac

echo
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${G}  Cardápio SaaS — Auto-instalador da Retaguarda  ${N}"
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo "  SO detectado: $OS_ID $OS_VER"
echo

# ── 1) Pré-req do sistema ───────────────────────────────────────────────────
log "Atualizando lista de pacotes e instalando dependências base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget ca-certificates gnupg lsb-release \
  jq openssl uuid-runtime git \
  >/dev/null
ok "Dependências base OK"

# ── 2) Docker ───────────────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  ok "Docker já instalado ($(docker --version))"
else
  log "Instalando Docker via script oficial"
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker
  ok "Docker instalado"
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose v2 não disponível após install — reinstale Docker manual"
  exit 1
fi

# ── 3) Clona/atualiza o repo ────────────────────────────────────────────────
INSTALL_DIR="/opt/cardapio_saas"
if [ ! -d "$INSTALL_DIR/.git" ]; then
  log "Clonando cardapio_saas em $INSTALL_DIR"
  git clone --depth 1 https://github.com/yurigoes/cardapio_saas.git "$INSTALL_DIR" >/dev/null
else
  log "Atualizando repo existente"
  git -C "$INSTALL_DIR" pull --ff-only >/dev/null 2>&1 || warn "git pull falhou (sem internet?), seguindo com o que está"
fi
ok "Repo em $INSTALL_DIR"

cd "$INSTALL_DIR/retaguarda"

# ── 4) Coleta dados (interativo OU via env) ─────────────────────────────────
echo
log "Configuração da retaguarda"

prompt_default() {
  local var="$1" prompt="$2" default="$3" current
  current=$(eval echo "\${$var:-}")
  if [ -n "$current" ]; then
    echo "  $prompt: $current (env)"
  else
    if [ -n "$default" ]; then
      read -p "  $prompt [$default]: " v
      v=${v:-$default}
    else
      read -p "  $prompt: " v
    fi
    eval "$var='$v'"
  fi
}

prompt_default EMPRESA_SLUG   "Slug da empresa (ex: top-cozinha-oriental)" ""
prompt_default MASTER_URL     "URL do master"                              "https://app.tthreedigital.com.br"
prompt_default BASE_DOMAIN    "Domínio raiz pra subdomínio"               "tthreedigital.com.br"
SUBDOMAIN_DEFAULT="loja-$(echo "$EMPRESA_SLUG" | tr -cd 'a-z0-9-')"
prompt_default SUBDOMAIN      "Subdomínio desta loja (sem .$BASE_DOMAIN)"  "$SUBDOMAIN_DEFAULT"
RETAGUARDA_DOMAIN="$SUBDOMAIN.$BASE_DOMAIN"

echo
echo "  → Domínio final desta retaguarda: ${G}$RETAGUARDA_DOMAIN${N}"
echo

prompt_default HEARTBEAT_SECRET "Heartbeat secret (do .env do master)"     ""

# ── 5) Cloudflare Tunnel ─────────────────────────────────────────────────────
echo
log "Configuração do Cloudflare Tunnel"
echo "  Pra essa loja ter HTTPS público SEM IP fixo, vamos criar um tunnel"
echo "  na sua conta Cloudflare. Você precisa de um API Token com permissões:"
echo "    • Account → Cloudflare Tunnel → Edit"
echo "    • Zone → DNS → Edit (zona $BASE_DOMAIN)"
echo "  Cria em: https://dash.cloudflare.com/profile/api-tokens"
echo

prompt_default CF_API_TOKEN  "Cloudflare API Token"   ""
prompt_default CF_ACCOUNT_ID "Cloudflare Account ID"  ""
prompt_default CF_ZONE_ID    "Cloudflare Zone ID ($BASE_DOMAIN)" ""

# Valida token
log "Validando API token"
VERIFY=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify)
if ! echo "$VERIFY" | jq -e '.success' >/dev/null; then
  err "Token inválido:"
  echo "$VERIFY" | jq .
  exit 1
fi
ok "Token válido"

# ── 6) Provisiona tunnel (idempotente) ──────────────────────────────────────
TUNNEL_NAME="retaguarda-$EMPRESA_SLUG-$(date +%s | tail -c 5)"

log "Procurando tunnel existente pra este domínio"
EXISTING=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel?name=retaguarda-$EMPRESA_SLUG" \
  | jq -r '.result[] | select(.deleted_at == null) | .id' | head -1)

if [ -n "$EXISTING" ]; then
  TUNNEL_ID="$EXISTING"
  log "Reusando tunnel existente: $TUNNEL_ID"
  # Pega novo token
  TOKEN_RESP=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token")
  TUNNEL_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.result')
else
  log "Criando tunnel novo: $TUNNEL_NAME"
  TUNNEL_SECRET=$(openssl rand -base64 32 | tr -d '\n')
  CREATE_RESP=$(curl -s -X POST \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel" \
    -d "{\"name\":\"$TUNNEL_NAME\",\"tunnel_secret\":\"$TUNNEL_SECRET\",\"config_src\":\"cloudflare\"}")
  TUNNEL_ID=$(echo "$CREATE_RESP" | jq -r '.result.id')
  if [ -z "$TUNNEL_ID" ] || [ "$TUNNEL_ID" = "null" ]; then
    err "Falha ao criar tunnel:"
    echo "$CREATE_RESP" | jq .
    exit 1
  fi
  TOKEN_RESP=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token")
  TUNNEL_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.result')
fi
ok "Tunnel ID: $TUNNEL_ID"

# ── 7) Configura ingress (rota → nginx local) ───────────────────────────────
log "Configurando rota: $RETAGUARDA_DOMAIN → nginx-cache:80"
INGRESS_CFG=$(jq -nc \
  --arg host "$RETAGUARDA_DOMAIN" \
  '{
    config: {
      ingress: [
        { hostname: $host, service: "http://nginx-cache:80",
          originRequest: { connectTimeout: 10, noTLSVerify: false, disableChunkedEncoding: false }
        },
        { service: "http_status:404" }
      ]
    }
  }')
PUT_RESP=$(curl -s -X PUT \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -d "$INGRESS_CFG")
if ! echo "$PUT_RESP" | jq -e '.success' >/dev/null; then
  err "Falha ao configurar ingress:"
  echo "$PUT_RESP" | jq .
  exit 1
fi
ok "Ingress configurado"

# ── 8) DNS CNAME → tunnel ──────────────────────────────────────────────────
log "Criando/atualizando DNS CNAME $RETAGUARDA_DOMAIN → $TUNNEL_ID.cfargotunnel.com"
TUNNEL_HOST="$TUNNEL_ID.cfargotunnel.com"

# Procura record existente
EXISTING_DNS=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=$RETAGUARDA_DOMAIN&type=CNAME" \
  | jq -r '.result[0].id // empty')

DNS_BODY=$(jq -nc \
  --arg name "$RETAGUARDA_DOMAIN" \
  --arg content "$TUNNEL_HOST" \
  '{type:"CNAME", name:$name, content:$content, proxied:true, ttl:1, comment:"Retaguarda Cardápio SaaS — auto-managed"}')

if [ -n "$EXISTING_DNS" ]; then
  curl -s -X PUT \
    -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$EXISTING_DNS" \
    -d "$DNS_BODY" | jq -e '.success' >/dev/null && ok "DNS atualizado"
else
  curl -s -X POST \
    -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
    -d "$DNS_BODY" | jq -e '.success' >/dev/null && ok "DNS criado"
fi

# ── 9) Grava .env ───────────────────────────────────────────────────────────
log "Gravando .env"
RID=$(cat /proc/sys/kernel/random/uuid)
cat > .env <<EOF
# Auto-gerado por install.sh em $(date -Iseconds)
MASTER_URL=$MASTER_URL
MASTER_HOST=$(echo "$MASTER_URL" | sed 's|https\?://||' | cut -d/ -f1)
RETAGUARDA_DOMAIN=$RETAGUARDA_DOMAIN
EMPRESA_SLUG=$EMPRESA_SLUG
RETAGUARDA_ID=$RID
HEARTBEAT_SECRET=$HEARTBEAT_SECRET

# Portas (default 80/443 só pra acesso LAN; tunnel não precisa porta exposta)
LISTEN_HTTP=80
LISTEN_HTTPS=443

# Cache
CACHE_MAX_HTML=200m
CACHE_MAX_MEDIA=5g
CACHE_MAX_STATIC=500m

# Cloudflare Tunnel
TUNNEL_ID=$TUNNEL_ID
TUNNEL_TOKEN=$TUNNEL_TOKEN
EOF
chmod 600 .env
ok ".env gerado em $INSTALL_DIR/retaguarda/.env"

# ── 10) Sobe containers ─────────────────────────────────────────────────────
mkdir -p nginx certs
log "Subindo containers (nginx-cache + redis + reporter + cloudflared)"
docker compose pull >/dev/null
docker compose up -d
sleep 5
echo
docker compose ps
echo

# ── 11) Teste end-to-end ────────────────────────────────────────────────────
log "Aguardando tunnel ficar pronto (até 30s)…"
for i in $(seq 1 6); do
  sleep 5
  if curl -fsS -o /dev/null -w "%{http_code}" "https://$RETAGUARDA_DOMAIN/__retaguarda_health" 2>/dev/null | grep -q "^200$"; then
    ok "Tunnel online — https://$RETAGUARDA_DOMAIN/__retaguarda_health respondeu 200"
    break
  fi
  echo "  …tentativa $i/6"
done

# ── 12) Resumo ──────────────────────────────────────────────────────────────
IP_LOCAL=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "?")
echo
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${G}  ✓ Retaguarda no ar                              ${N}"
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo
echo "  Empresa:           $EMPRESA_SLUG"
echo "  Domínio público:   https://$RETAGUARDA_DOMAIN"
echo "  IP local LAN:      $IP_LOCAL  (porta 80)"
echo "  Tunnel ID:         $TUNNEL_ID"
echo "  Master:            $MASTER_URL"
echo
echo -e "${Y}OPCIONAL — pra ganhar latência <1ms na LAN:${N}"
echo "  Aponta no roteador local (DNS estático):"
echo "  $RETAGUARDA_DOMAIN → $IP_LOCAL"
echo
echo -e "${Y}Comandos úteis:${N}"
echo "  Logs:        cd $INSTALL_DIR/retaguarda && docker compose logs -f"
echo "  Restart:     cd $INSTALL_DIR/retaguarda && docker compose restart"
echo "  Status:      cd $INSTALL_DIR/retaguarda && docker compose ps"
echo "  Re-instalar: sudo bash $INSTALL_DIR/retaguarda/install.sh"
echo
echo "  Confere também: $MASTER_URL/admin/retaguardas"
echo
