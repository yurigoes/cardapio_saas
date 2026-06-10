#!/bin/bash
# seed-credenciais.sh — Cria OAuth Client automatico no Xibo v4 POC.
#
# Roda na VPS depois que o CMS v4 subir (3-5min apos `docker compose up -d`).
# Insere um OAuth Client com escopos completos direto no MySQL e imprime as
# credenciais pra serem coladas no .env da landing.
#
# Uso:
#   chmod +x seed-credenciais.sh
#   ./seed-credenciais.sh
#
# Idempotente: se ja existe um client "saas-poc-v4" reusa o mesmo.

set -e

DB_CONTAINER="midia_xibo_db_v4"
CMS_CONTAINER="midia_xibo_web_v4"
APP_NAME="saas-poc-v4"

# Pega senha do MySQL do .env do compose
COMPOSE_DIR="$(dirname "$(realpath "$0")")"
MYSQL_PASS=$(grep "^MYSQL_PASSWORD=" "$COMPOSE_DIR/.env" | cut -d= -f2- | tr -d '"')

if [ -z "$MYSQL_PASS" ]; then
  echo "ERRO: nao achei MYSQL_PASSWORD em $COMPOSE_DIR/.env"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "ERRO: container $DB_CONTAINER nao esta rodando."
  echo "  Suba o stack primeiro: docker compose up -d"
  exit 1
fi

# Espera o DB estar pronto + Xibo ter rodado as migrations (cria oauth_clients)
echo "Aguardando CMS terminar setup inicial (verifica se tabela oauth_clients existe)..."
for i in {1..60}; do
  if docker exec "$DB_CONTAINER" sh -c "mysql -u cms -p${MYSQL_PASS} cms -e 'SHOW TABLES LIKE \"oauth_clients\"' 2>/dev/null" | grep -q oauth_clients; then
    echo "OK CMS pronto."
    break
  fi
  echo "  ...aguardando ($i/60)"
  sleep 5
done

if ! docker exec "$DB_CONTAINER" sh -c "mysql -u cms -p${MYSQL_PASS} cms -e 'SHOW TABLES LIKE \"oauth_clients\"' 2>/dev/null" | grep -q oauth_clients; then
  echo "ERRO: tabela oauth_clients nao apareceu. CMS pode ter falhado o setup."
  echo "  Veja: docker compose logs cms-web"
  exit 1
fi

# Gera client_id e secret
# (formato compatível com o que Xibo gera no painel)
CLIENT_ID=$(openssl rand -hex 20 | head -c 40)
CLIENT_SECRET=$(openssl rand -hex 32 | head -c 60)
USER_ID=1  # xibo_admin

# Verifica se ja existe
EXISTING=$(docker exec "$DB_CONTAINER" sh -c "mysql -u cms -p${MYSQL_PASS} -N -B cms -e \"SELECT id FROM oauth_clients WHERE name='${APP_NAME}' LIMIT 1\" 2>/dev/null" | tr -d '[:space:]')

if [ -n "$EXISTING" ]; then
  echo ""
  echo "ja existe client '${APP_NAME}'. Reusando id existente."
  CLIENT_ID="$EXISTING"
  # Lê o secret existente
  CLIENT_SECRET=$(docker exec "$DB_CONTAINER" sh -c "mysql -u cms -p${MYSQL_PASS} -N -B cms -e \"SELECT secret FROM oauth_clients WHERE id='${CLIENT_ID}'\" 2>/dev/null" | tr -d '[:space:]')
else
  # Insere o cliente. Xibo v4 tem campos: id, secret, name, userId, authCode, clientCredentials
  docker exec "$DB_CONTAINER" mysql -u cms -p${MYSQL_PASS} cms -e "
    INSERT INTO oauth_clients (id, secret, name, userId, authCode, clientCredentials)
    VALUES ('${CLIENT_ID}', '${CLIENT_SECRET}', '${APP_NAME}', ${USER_ID}, 0, 1);
  " 2>/dev/null

  # Atribui TODOS os escopos disponiveis ao client
  docker exec "$DB_CONTAINER" mysql -u cms -p${MYSQL_PASS} cms -e "
    INSERT INTO oauth_client_scopes (clientId, scopeId)
    SELECT '${CLIENT_ID}', id FROM oauth_scopes
    ON DUPLICATE KEY UPDATE clientId=clientId;
  " 2>/dev/null

  echo ""
  echo "Cliente OAuth criado: ${APP_NAME}"
fi

# Pega senha inicial do admin (do log) — pra logar no painel se precisar
ADMIN_PASS=$(docker logs "$CMS_CONTAINER" 2>&1 | grep -oP "(?<=Initial password: )[A-Za-z0-9!@#\$%^&*\-_=+]+" | tail -1)

echo ""
echo "========================================================================="
echo "  CREDENCIAIS XIBO v4 POC"
echo "========================================================================="
echo ""
echo "  Acesso ao painel web (apenas pra debug visual):"
echo "    URL:     http://127.0.0.1:8086"
echo "    Usuario: xibo_admin"
if [ -n "$ADMIN_PASS" ]; then
  echo "    Senha:   $ADMIN_PASS"
else
  echo "    Senha:   (procure 'Initial password' em: docker compose logs cms-web)"
fi
echo ""
echo "  OAuth Client (cole no .env da landing):"
echo ""
echo "    XIBO_V4_URL=http://midia_xibo_web_v4"
echo "    XIBO_V4_CLIENT_ID=${CLIENT_ID}"
echo "    XIBO_V4_CLIENT_SECRET=${CLIENT_SECRET}"
echo ""
echo "========================================================================="
echo ""
echo "Proximos passos:"
echo "  1. cd /opt/cardapio_saas/midia-indoor/landing"
echo "  2. echo '' >> .env  (adiciona linha em branco)"
echo "  3. Cola as 3 linhas XIBO_V4_* acima no .env"
echo "  4. docker network connect xibo_v4_net midia_landing"
echo "  5. docker compose restart"
echo "  6. SECRET=\$(grep CRON_SECRET .env | cut -d= -f2)"
echo "     curl -sS \"http://127.0.0.1:3100/api/admin/xibo-v4-test?key=\$SECRET\" | jq ."
echo ""
