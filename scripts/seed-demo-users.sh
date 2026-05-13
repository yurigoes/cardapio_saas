#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Cria usuários demo (1 por role) na empresa demo.
#  Senha padrão pra todos: Demo2026
#
#  Uso:  bash scripts/seed-demo-users.sh [empresa_id]
#  Sem args: tenta encontrar a primeira empresa não deletada.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

EMPRESA_ID="${1:-}"
SENHA="Demo2026"

if [[ -z "$EMPRESA_ID" ]]; then
  EMPRESA_ID=$(docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -tAc \
    "SELECT id FROM empresas WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;")
  if [[ -z "$EMPRESA_ID" ]]; then
    echo -e "${RED}✖${NC} Nenhuma empresa encontrada. Cria uma no painel master primeiro."
    exit 1
  fi
  echo -e "${YELLOW}→${NC} Usando empresa ${EMPRESA_ID}"
fi

declare -A ROLES=(
  [admin]="admin@demo.com"
  [gerente]="gerente@demo.com"
  [garcom]="garcom@demo.com"
  [cozinha]="cozinha@demo.com"
  [financeiro]="financeiro@demo.com"
  [delivery]="delivery@demo.com"
  [atendente]="atendente@demo.com"
  [motoboy]="motoboy@demo.com"
)

for role in "${!ROLES[@]}"; do
  email="${ROLES[$role]}"
  echo -e "${YELLOW}→${NC} Criando ${role} (${email})..."
  docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL >/dev/null
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO usuarios (empresa_id, nome, email, senha_hash, role, ativo, tentativas_login)
VALUES (
  '$EMPRESA_ID',
  'Demo $role',
  '$email',
  crypt('$SENHA', gen_salt('bf', 12)),
  '$role',
  true,
  0
)
ON CONFLICT (email) DO UPDATE
  SET senha_hash       = crypt('$SENHA', gen_salt('bf', 12)),
      role             = EXCLUDED.role,
      empresa_id       = EXCLUDED.empresa_id,
      ativo            = true,
      deleted_at       = NULL,
      bloqueado_ate    = NULL,
      tentativas_login = 0;
SQL
done

echo ""
echo -e "${GREEN}✓${NC} Usuários demo prontos. Senha de todos: ${SENHA}"
echo ""
docker exec cardapio_postgres psql -U cardapio -d cardapio_saas -c \
  "SELECT email, role, ativo FROM usuarios
    WHERE empresa_id = '$EMPRESA_ID' AND email LIKE '%@demo.com'
    ORDER BY role;"
