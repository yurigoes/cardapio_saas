#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Instala o tema "Three Digital" no Xibo CMS (container midia_xibo_web).
#
# Copia o diretório theme/threedigital pra dentro do volume de temas custom
# do Xibo. Depois você seleciona "Three Digital Mídia" em Configurações → Tema.
#
# Roda na VPS, na pasta /opt/midia-indoor/xibo (onde está o docker-compose).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

CONTAINER="midia_xibo_web"
SRC="$(dirname "$0")/theme/threedigital"
DST="/var/www/cms/web/theme/custom/threedigital"

echo "▸ Instalando tema Three Digital no $CONTAINER…"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "✗ Container $CONTAINER não está rodando. Suba o Xibo primeiro (docker compose up -d)."
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "✗ Pasta do tema não encontrada em $SRC"
  exit 1
fi

# Cria destino e copia
docker exec "$CONTAINER" mkdir -p "$DST/img" "$DST/css"
docker cp "$SRC/config.php"        "$CONTAINER:$DST/config.php"
docker cp "$SRC/css/override.css"  "$CONTAINER:$DST/css/override.css"

# Logos — copia se existirem (senão usa os do tema default por enquanto)
if [ -f "$SRC/img/logo.png" ]; then
  docker cp "$SRC/img/logo.png"       "$CONTAINER:$DST/img/logo.png"
fi
if [ -f "$SRC/img/logo-small.png" ]; then
  docker cp "$SRC/img/logo-small.png" "$CONTAINER:$DST/img/logo-small.png"
fi

# Permissões (Xibo roda como www-data)
docker exec "$CONTAINER" chown -R www-data:www-data "$DST" 2>/dev/null || true

echo "✓ Tema instalado em $DST"
echo
echo "Próximos passos:"
echo "  1. No painel Xibo: Configurações → Tema → escolha 'Three Digital Mídia' → Salvar"
echo "  2. Ctrl+F5 pra recarregar"
echo "  3. Pra trocar o logo: ver theme/threedigital/img/README.txt"
