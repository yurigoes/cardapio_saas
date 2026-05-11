-- ─────────────────────────────────────────────────────────────────────────────
-- Init 00 — Configurações iniciais do PostgreSQL
-- Executado pelo docker-entrypoint-initdb.d na primeira inicialização
-- ─────────────────────────────────────────────────────────────────────────────

-- Usa MD5 para armazenar senhas (compatibilidade com Prisma ORM usado pelo Evolution API)
ALTER SYSTEM SET password_encryption = 'md5';
SELECT pg_reload_conf();

-- Re-define a senha do usuário principal com MD5
-- (a senha real é substituída pelo install.sh via --build-arg ou sed)
-- ALTER USER cardapio WITH PASSWORD '${DB_PASSWORD}';  ← feito pelo install.sh

-- Banco de dados dedicado para Evolution API
CREATE DATABASE evolution OWNER cardapio;

-- Usuário dedicado para Evolution API
-- A senha é definida pelo install.sh após o start
CREATE USER evolution WITH PASSWORD 'changeme_evolution';
GRANT ALL PRIVILEGES ON DATABASE evolution TO evolution;

-- Schema N8N dentro do banco principal
\c cardapio_saas
CREATE SCHEMA IF NOT EXISTS n8n AUTHORIZATION cardapio;
