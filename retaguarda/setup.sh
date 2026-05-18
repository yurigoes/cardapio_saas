#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Setup interativo da retaguarda. Roda no mini-PC do restaurante.
# Pré-req: Docker + docker compose instalados.
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}━━━ Setup da Retaguarda Cardápio SaaS ━━━${NC}"
echo

# 1. Checa Docker
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}Docker não encontrado.${NC}"
  echo "Instale antes: curl -fsSL https://get.docker.com | sh"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}docker compose v2 não encontrado.${NC}"
  exit 1
fi

# 2. Cria .env se não existir
if [ ! -f .env ]; then
  echo -e "${YELLOW}Configurando .env interativamente${NC}"
  cp .env.example .env

  read -p "Slug da empresa (ex: top-cozinha-oriental): " SLUG
  read -p "Domínio desta retaguarda (ex: loja1.tthreedigital.com.br): " DOM
  read -p "URL do master [https://app.tthreedigital.com.br]: " MASTER
  MASTER=${MASTER:-https://app.tthreedigital.com.br}
  MASTER_HOST=$(echo "$MASTER" | sed 's|https\?://||' | cut -d/ -f1)

  # Gera UUID local sem depender de uuidgen
  if command -v uuidgen >/dev/null 2>&1; then
    RID=$(uuidgen)
  else
    RID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || \
          openssl rand -hex 16 | sed 's/\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)/\1\2\3\4-\5\6-\7\8-\9\10-\11\12\13\14\15\16/')
  fi
  SECRET=$(openssl rand -hex 24)

  # Substitui no .env (sed compatível com Linux+macOS)
  sed -i.bak "s|EMPRESA_SLUG=.*|EMPRESA_SLUG=$SLUG|" .env
  sed -i.bak "s|RETAGUARDA_DOMAIN=.*|RETAGUARDA_DOMAIN=$DOM|" .env
  sed -i.bak "s|MASTER_URL=.*|MASTER_URL=$MASTER|" .env
  sed -i.bak "s|MASTER_HOST=.*|MASTER_HOST=$MASTER_HOST|" .env
  sed -i.bak "s|RETAGUARDA_ID=.*|RETAGUARDA_ID=$RID|" .env
  sed -i.bak "s|HEARTBEAT_SECRET=.*|HEARTBEAT_SECRET=$SECRET|" .env
  rm -f .env.bak

  echo
  echo -e "${YELLOW}── IMPORTANTE ─────────────────────────────────────${NC}"
  echo "Adicione no master (.env da VPS principal):"
  echo "  RETAGUARDA_HEARTBEAT_SECRET=$SECRET"
  echo "Depois reinicie o app: docker restart cardapio_app"
  echo -e "${YELLOW}───────────────────────────────────────────────────${NC}"
  echo
else
  echo "Usando .env existente."
fi

# 3. Cria pastas
mkdir -p nginx certs

# 4. Sobe
echo "Subindo containers…"
docker compose pull
docker compose up -d
sleep 3

# 5. Status
echo
echo -e "${GREEN}━━━ Status ━━━${NC}"
docker compose ps
echo
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo -e "${GREEN}Retaguarda no ar em http://$IP/__retaguarda_status${NC}"
echo
echo "Próximos passos:"
echo "  1. Aponte o DNS de '$(grep ^RETAGUARDA_DOMAIN .env | cut -d= -f2)' pro IP $IP"
echo "  2. Configure SSL (Let's Encrypt, ver README.md)"
echo "  3. Aponte os totens/PDVs do restaurante pra https://$(grep ^RETAGUARDA_DOMAIN .env | cut -d= -f2)"
echo
echo "Pra ver logs:    docker compose logs -f nginx-cache"
echo "Pra reiniciar:   docker compose restart"
echo "Pra parar:       docker compose down"
