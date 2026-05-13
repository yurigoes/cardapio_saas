#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Reseta a senha do admin master sem precisar rodar install.sh
#  inteiro. Usa pgcrypto direto no Postgres (sem dependências
#  externas) — formato $2a$ é compatível com bcryptjs.
#
#  Uso:
#    bash scripts/reset-master.sh
#    bash scripts/reset-master.sh master@meudom.com.br MinhaSenha123
#
#  Sem args: usa MASTER_EMAIL/MASTER_PASSWORD do .env do projeto.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

PROJECT_DIR="${CARDAPIO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${PROJECT_DIR}/.env"

EMAIL="${1:-}"
SENHA="${2:-}"

if [[ -z "$EMAIL" || -z "$SENHA" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}✖${NC} Sem args e .env não encontrado em ${ENV_FILE}"
    echo "   Use: bash $0 <email> <senha>"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  EMAIL="${EMAIL:-$MASTER_EMAIL}"
  SENHA="${SENHA:-$MASTER_PASSWORD}"
fi

EMAIL_LC="${EMAIL,,}"
SENHA_ESC="${SENHA//\'/\'\'}"

if ! docker ps --format '{{.Names}}' | grep -q '^cardapio_postgres$'; then
  echo -e "${RED}✖${NC} Container cardapio_postgres não está rodando"
  exit 1
fi

echo -e "${YELLOW}→${NC} Resetando senha do master ${EMAIL_LC}..."

docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Apaga masters duplicados (se houver) com email diferente
DELETE FROM usuarios WHERE role='master' AND LOWER(email) <> '${EMAIL_LC}';

INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, tentativas_login)
VALUES (
  gen_random_uuid(), 'Master Admin', '${EMAIL_LC}',
  crypt('${SENHA_ESC}', gen_salt('bf', 12)),
  'master', true, 0
)
ON CONFLICT (email) DO UPDATE
  SET senha_hash       = crypt('${SENHA_ESC}', gen_salt('bf', 12)),
      role             = 'master',
      ativo            = true,
      deleted_at       = NULL,
      bloqueado_ate    = NULL,
      tentativas_login = 0;
SQL

# Verifica se a senha realmente confere
OK=$(docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas -tAc \
  "SELECT (senha_hash = crypt('${SENHA_ESC}', senha_hash)) FROM usuarios WHERE email='${EMAIL_LC}';")

if [[ "$OK" != "t" ]]; then
  echo -e "${RED}✖${NC} Senha não confere após reset — algo deu errado"
  exit 1
fi

# Limpa rate limit no Redis (caso conta tenha sido bloqueada por tentativas)
if docker ps --format '{{.Names}}' | grep -q '^cardapio_redis$'; then
  REDIS_PASSWORD="${REDIS_PASSWORD:-}"
  if [[ -n "$REDIS_PASSWORD" ]]; then
    docker exec cardapio_redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern 'rl:auth:*' 2>/dev/null | \
      xargs -r docker exec -i cardapio_redis redis-cli -a "$REDIS_PASSWORD" DEL >/dev/null 2>&1 || true
    echo -e "${GREEN}✓${NC} Rate limit do Redis limpo"
  fi
fi

echo -e "${GREEN}✓${NC} Master atualizado:"
echo "    Email: ${EMAIL_LC}"
echo "    Senha: ${SENHA}"
echo "    Login: https://${DOMAIN:-app.tthreedigital.com.br}/login"
