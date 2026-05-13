#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Diagnóstico completo do login master.
#  Roda 4 verificações no banco + 1 no app + tail do log.
#  Use quando o login está dando 401 e você não sabe por quê.
#
#  Uso:  bash scripts/debug-master.sh [email] [senha]
#  Sem args: lê de .env
# ═══════════════════════════════════════════════════════════════
set -uo pipefail   # sem -e propositalmente — queremos ver os erros

PROJECT_DIR="${CARDAPIO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
[[ -f "$PROJECT_DIR/.env" ]] && source "$PROJECT_DIR/.env"

EMAIL="${1:-${MASTER_EMAIL:-}}"
SENHA="${2:-${MASTER_PASSWORD:-}}"
EMAIL_LC="${EMAIL,,}"

echo "════════════════════════════════════════════════════════"
echo "  DIAGNÓSTICO LOGIN MASTER"
echo "  Email: $EMAIL_LC"
echo "  Senha: ${SENHA:0:3}*** (${#SENHA} chars)"
echo "════════════════════════════════════════════════════════"
echo ""

echo "━━━ 1) Containers ━━━"
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'app|postgres|redis'
echo ""

echo "━━━ 2) Banco — usuário existe? ━━━"
docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL
\x on
SELECT id, email, role, ativo, deleted_at, bloqueado_ate, tentativas_login,
       length(senha_hash) AS hash_len, left(senha_hash, 7) AS hash_prefix
  FROM usuarios WHERE LOWER(email) = '$EMAIL_LC' OR role='master';
SQL
echo ""

echo "━━━ 3) Banco — senha bate com hash? ━━━"
docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL
\x off
SELECT email,
       (senha_hash = crypt('${SENHA//\'/\'\'}', senha_hash)) AS senha_confere
  FROM usuarios WHERE LOWER(email) = '$EMAIL_LC';
SQL
echo ""

echo "━━━ 4) Banco — colunas necessárias existem? ━━━"
docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas <<SQL
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name='usuarios'
   AND column_name IN ('email','senha_hash','role','ativo','deleted_at','bloqueado_ate','tentativas_login')
 ORDER BY column_name;
SQL
echo ""

echo "━━━ 5) Redis — rate limit ativo? ━━━"
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
  COUNT=$(docker exec cardapio_redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern 'rl:auth:*' 2>/dev/null | wc -l)
  echo "Chaves rl:auth:*  → $COUNT"
  if [[ "$COUNT" -gt 0 ]]; then
    docker exec cardapio_redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern 'rl:auth:*' 2>/dev/null | head -5
  fi
else
  echo "(REDIS_PASSWORD não disponível — pulando)"
fi
echo ""

echo "━━━ 6) Curl — login direto no app (bypass Cloudflare) ━━━"
RESP=$(curl -sS -i -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL_LC\",\"senha\":\"$SENHA\"}" 2>&1)
echo "$RESP" | head -25
echo ""

echo "━━━ 7) Logs do app (últimas 30 linhas) ━━━"
docker logs cardapio_app --tail 30 2>&1
echo ""

echo "════════════════════════════════════════════════════════"
echo "  FIM DO DIAGNÓSTICO"
echo "════════════════════════════════════════════════════════"
