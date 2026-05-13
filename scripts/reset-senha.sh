#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Reseta senha de QUALQUER usuário (admin, gerente, garcom, etc).
#  Limpa bloqueio, ativa conta, zera tentativas.
#
#  Uso:
#    bash scripts/reset-senha.sh <email> <senha_nova>
#
#  Exemplos:
#    bash scripts/reset-senha.sh admin@demo.com NovaSenha123
#    bash scripts/reset-senha.sh "*" SenhaPadrao2026   # reseta TODOS
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

EMAIL="${1:-}"
SENHA="${2:-}"

if [[ -z "$EMAIL" || -z "$SENHA" ]]; then
  echo "Uso: bash $0 <email|*> <senha_nova>"
  echo ""
  echo "Exemplos:"
  echo "  bash $0 admin@demo.com NovaSenha123"
  echo "  bash $0 '*' SenhaPadrao2026   # reseta TODOS os usuários"
  exit 1
fi

EMAIL_LC="${EMAIL,,}"
SENHA_ESC="${SENHA//\'/\'\'}"

if ! docker ps --format '{{.Names}}' | grep -q '^cardapio_postgres$'; then
  echo -e "${RED}✖${NC} Container cardapio_postgres não está rodando"
  exit 1
fi

if [[ "$EMAIL_LC" == "*" ]]; then
  WHERE="WHERE deleted_at IS NULL"
  echo -e "${YELLOW}→${NC} Resetando senha de TODOS os usuários ativos..."
else
  WHERE="WHERE LOWER(email) = '$EMAIL_LC'"
  echo -e "${YELLOW}→${NC} Resetando senha de $EMAIL_LC..."
fi

docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE usuarios
   SET senha_hash       = crypt('$SENHA_ESC', gen_salt('bf', 12)),
       ativo            = true,
       deleted_at       = NULL,
       bloqueado_ate    = NULL,
       tentativas_login = 0
$WHERE
RETURNING email, role;
SQL

# Limpa rate limit
PROJECT_DIR="${CARDAPIO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
[[ -f "$PROJECT_DIR/.env" ]] && source "$PROJECT_DIR/.env"
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
  docker exec cardapio_redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern 'rl:auth:*' 2>/dev/null | \
    xargs -r docker exec -i cardapio_redis redis-cli -a "$REDIS_PASSWORD" DEL >/dev/null 2>&1 || true
fi

echo ""
echo -e "${GREEN}✓${NC} Senha aplicada: $SENHA"
