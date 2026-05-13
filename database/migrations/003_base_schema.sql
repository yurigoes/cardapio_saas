-- ─────────────────────────────────────────────────────────────────────────────
-- 003 — Schema base (bootstrap) — tabelas centrais do sistema
-- ─────────────────────────────────────────────────────────────────────────────
-- Cria as tabelas core que migrations posteriores estendem com ALTER TABLE.
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigger global pra updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ── planos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  preco       NUMERIC(10,2) DEFAULT 0,
  periodo     VARCHAR(20)  DEFAULT 'mensal',
  modulos     JSONB        DEFAULT '[]'::jsonb,
  limites     JSONB        DEFAULT '{}'::jsonb,
  ativo       BOOLEAN      DEFAULT true,
  destaque    BOOLEAN      DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── empresas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia   VARCHAR(255)  NOT NULL,
  razao_social    VARCHAR(255),
  cnpj            VARCHAR(20),
  slug            VARCHAR(100)  NOT NULL UNIQUE,
  subdominio      VARCHAR(100)  UNIQUE,
  cor_primaria    VARCHAR(20)   DEFAULT '#10B981',
  cor_secundaria  VARCHAR(20)   DEFAULT '#0F172A',
  whatsapp        VARCHAR(20),
  telefone        VARCHAR(20),
  email           VARCHAR(255),
  plano_id        UUID          REFERENCES planos(id) ON DELETE SET NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'teste',
  modulos_ativos  JSONB         NOT NULL DEFAULT '[]'::jsonb,
  assinatura_expira_em TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_empresas_slug    ON empresas(slug);
CREATE INDEX IF NOT EXISTS idx_empresas_status  ON empresas(status) WHERE deleted_at IS NULL;

-- ── usuarios ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(255)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  senha_hash      VARCHAR(255)  NOT NULL,
  role            VARCHAR(30)   NOT NULL,
  empresa_id      UUID          REFERENCES empresas(id) ON DELETE CASCADE,
  telefone        VARCHAR(20),
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  ultimo_login    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_usuarios_email   ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id) WHERE deleted_at IS NULL;

-- Lockout de tentativas de login (anti brute-force)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tentativas_login INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_ate    TIMESTAMPTZ;

-- ── categorias ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100)  NOT NULL,
  descricao   TEXT,
  imagem_url  TEXT,
  ordem       INTEGER       NOT NULL DEFAULT 0,
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  disponivel  BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id) WHERE deleted_at IS NULL;

-- ── produtos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id  UUID          REFERENCES categorias(id) ON DELETE SET NULL,
  nome          VARCHAR(255)  NOT NULL,
  descricao     TEXT,
  preco         NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_custo   NUMERIC(10,2),
  imagem_url    TEXT,
  tipo          VARCHAR(20)   DEFAULT 'comida',
  destaque      BOOLEAN       DEFAULT false,
  disponivel    BOOLEAN       NOT NULL DEFAULT true,
  ativo         BOOLEAN       NOT NULL DEFAULT true,    -- alias legado de 'disponivel'
  tempo_preparo INTEGER,
  pontos_fidelidade INTEGER   DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
-- Garante 'ativo' em instalações onde a tabela já existia
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_produtos_empresa   ON produtos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id);

-- ── mesas ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesas (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero      INTEGER       NOT NULL,
  nome        VARCHAR(50),
  capacidade  INTEGER       DEFAULT 4,
  setor       VARCHAR(100),
  status      VARCHAR(20)   NOT NULL DEFAULT 'livre',
  qrcode_url  TEXT,
  pedido_ativo_id UUID,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT mesas_empresa_numero_uniq UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_mesas_empresa ON mesas(empresa_id) WHERE deleted_at IS NULL;

-- ── pedidos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          SERIAL,
  tipo            VARCHAR(20)   NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pendente',
  mesa_id         UUID          REFERENCES mesas(id) ON DELETE SET NULL,
  comanda         VARCHAR(50),
  cliente_id      UUID,
  cliente_nome    VARCHAR(255),
  cliente_telefone VARCHAR(20),
  cliente_endereco JSONB,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto        NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxa_entrega    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  pontos_ganhos   INTEGER       DEFAULT 0,
  observacoes     TEXT,
  forma_pagamento VARCHAR(50),
  tipo_consumo    VARCHAR(20)   DEFAULT 'local',
  cupom_id        UUID,
  motoboy_id      UUID,
  zona_id         UUID,
  usuario_id      UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  atendente_id    UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa  ON pedidos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_status   ON pedidos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa     ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_motoboy  ON pedidos(motoboy_id);

-- ── pedido_itens ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_itens (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id      UUID          REFERENCES produtos(id) ON DELETE SET NULL,
  nome            VARCHAR(255)  NOT NULL,
  preco_unitario  NUMERIC(10,2) NOT NULL,
  quantidade      INTEGER       NOT NULL DEFAULT 1,
  subtotal        NUMERIC(10,2) NOT NULL,
  observacoes     TEXT,
  adicionais      JSONB         DEFAULT '[]'::jsonb,
  complementos    JSONB         DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id);

-- ── motoboys (legado básico, estendido pela 008/031) ─────────────────────────
CREATE TABLE IF NOT EXISTS motoboys (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  telefone    VARCHAR(20),
  veiculo     VARCHAR(50),
  placa       VARCHAR(10),
  status      VARCHAR(20)  DEFAULT 'disponivel',
  ativo       BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_motoboys_empresa ON motoboys(empresa_id);

-- ── gateways_config (estendido pelas migrations 009/011) ─────────────────────
CREATE TABLE IF NOT EXISTS gateways_config (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  slug            VARCHAR(50)   NOT NULL,
  nome            VARCHAR(100),
  ambiente        VARCHAR(20)   DEFAULT 'producao',
  ativo           BOOLEAN       NOT NULL DEFAULT false,
  padrao          BOOLEAN       NOT NULL DEFAULT false,
  client_id       TEXT,
  client_secret   TEXT,
  api_key         TEXT,
  token           TEXT,
  configuracoes   JSONB         DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT gateways_empresa_slug_uniq UNIQUE (empresa_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_gateways_empresa ON gateways_config(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gateways_slug    ON gateways_config(slug, ativo) WHERE deleted_at IS NULL;

-- ── zonas_entrega (legado básico, estendido pela 031) ────────────────────────
CREATE TABLE IF NOT EXISTS zonas_entrega (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  taxa        NUMERIC(10,2) DEFAULT 0,
  tempo_min   INTEGER,
  ativo       BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── tabelas auxiliares de segurança/auditoria ────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID,
  usuario_id  UUID,
  acao        VARCHAR(100) NOT NULL,
  recurso     VARCHAR(100),
  recurso_id  UUID,
  dados_antes JSONB,
  dados_novos JSONB,
  ip_origem   INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_empresa ON audit_log(empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        VARCHAR(50)  NOT NULL,
  ip_origem   INET,
  user_agent  TEXT,
  detalhes    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessoes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  refresh_hash    VARCHAR(255) NOT NULL,
  ip_origem       INET,
  user_agent      TEXT,
  expira_em       TIMESTAMPTZ  NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id          BIGSERIAL    PRIMARY KEY,
  chave       VARCHAR(255) NOT NULL,
  ip_origem   INET,
  rota        VARCHAR(255),
  bloqueado   BOOLEAN      DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Triggers updated_at
DROP TRIGGER IF EXISTS tg_empresas_updated   ON empresas;
CREATE TRIGGER tg_empresas_updated   BEFORE UPDATE ON empresas   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS tg_usuarios_updated   ON usuarios;
CREATE TRIGGER tg_usuarios_updated   BEFORE UPDATE ON usuarios   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS tg_categorias_updated ON categorias;
CREATE TRIGGER tg_categorias_updated BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS tg_produtos_updated   ON produtos;
CREATE TRIGGER tg_produtos_updated   BEFORE UPDATE ON produtos   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS tg_mesas_updated      ON mesas;
CREATE TRIGGER tg_mesas_updated      BEFORE UPDATE ON mesas      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS tg_pedidos_updated    ON pedidos;
CREATE TRIGGER tg_pedidos_updated    BEFORE UPDATE ON pedidos    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS tg_motoboys_updated   ON motoboys;
CREATE TRIGGER tg_motoboys_updated   BEFORE UPDATE ON motoboys   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
