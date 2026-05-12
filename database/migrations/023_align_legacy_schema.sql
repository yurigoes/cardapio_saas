-- ─────────────────────────────────────────────────────────────────────────────
-- 023 — Alinha schema legado às migrations 011/013/017
-- ─────────────────────────────────────────────────────────────────────────────
-- Algumas instalações tinham as tabelas pagamentos / caixas / caixa_movimentos
-- / estoque_movimentos criadas em versões antigas, com colunas faltando.
-- As migrations 011/013/017 usam CREATE TABLE IF NOT EXISTS — então não
-- recriam as tabelas pré-existentes, e nem aplicam as colunas novas.
--
-- Esta migration corrige cada tabela com ALTER ADD COLUMN IF NOT EXISTS.
-- 100% idempotente — pode rodar várias vezes sem efeito.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── pagamentos (esperado pela migration 011) ─────────────────────────────────
ALTER TABLE pagamentos
  ADD COLUMN IF NOT EXISTS empresa_id    UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pedido_id     UUID         REFERENCES pedidos(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gateway_slug  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gateway_id    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS metodo        VARCHAR(30)  DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS status        VARCHAR(30)  DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS valor         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gateway_data  JSONB        DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ  DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ  DEFAULT NOW();

-- Índices da 011 (re-aplica caso tenham sumido)
CREATE INDEX        IF NOT EXISTS idx_pagamentos_empresa ON pagamentos(empresa_id);
CREATE INDEX        IF NOT EXISTS idx_pagamentos_pedido  ON pagamentos(pedido_id);
CREATE INDEX        IF NOT EXISTS idx_pagamentos_gateway ON pagamentos(gateway_slug, gateway_id);
CREATE INDEX        IF NOT EXISTS idx_pagamentos_status  ON pagamentos(status);

-- UNIQUE (gateway_slug, gateway_id) — só cria se ainda não existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pagamentos_gateway_unique'
  ) THEN
    BEGIN
      ALTER TABLE pagamentos
        ADD CONSTRAINT pagamentos_gateway_unique UNIQUE (gateway_slug, gateway_id);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Não foi possível criar pagamentos_gateway_unique: %', SQLERRM;
    END;
  END IF;
END $$;

-- ── caixas (esperado pela migration 013) ─────────────────────────────────────
ALTER TABLE caixas
  ADD COLUMN IF NOT EXISTS empresa_id             UUID,
  ADD COLUMN IF NOT EXISTS usuario_abertura_id    UUID         REFERENCES usuarios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS usuario_fechamento_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_abertura         NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_esperado         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_fechamento       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS diferenca              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS status                 VARCHAR(20)  DEFAULT 'aberto',
  ADD COLUMN IF NOT EXISTS observacoes            TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_fechamento TEXT,
  ADD COLUMN IF NOT EXISTS aberto_em              TIMESTAMPTZ  DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS fechado_em             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at             TIMESTAMPTZ  DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ  DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_aberto_unique
  ON caixas (empresa_id) WHERE status = 'aberto';
CREATE INDEX        IF NOT EXISTS idx_caixas_empresa ON caixas (empresa_id);
CREATE INDEX        IF NOT EXISTS idx_caixas_status  ON caixas (empresa_id, status);
CREATE INDEX        IF NOT EXISTS idx_caixas_aberto  ON caixas (aberto_em DESC);

-- ── caixa_movimentos (esperado pela 013) ─────────────────────────────────────
-- A instalação antiga tem 'movimentos_caixa' (tabela diferente). Vamos garantir
-- 'caixa_movimentos' — se já existe, ALTER faz nada de mais.
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id        UUID         REFERENCES caixas(id) ON DELETE CASCADE,
  empresa_id      UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_id       UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo            VARCHAR(20)  NOT NULL,
  forma_pagamento VARCHAR(30),
  valor           NUMERIC(10,2) NOT NULL,
  descricao       TEXT,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE caixa_movimentos
  ADD COLUMN IF NOT EXISTS caixa_id        UUID         REFERENCES caixas(id)   ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS empresa_id      UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pedido_id       UUID         REFERENCES pedidos(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30),
  ADD COLUMN IF NOT EXISTS valor           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS descricao       TEXT,
  ADD COLUMN IF NOT EXISTS criado_em       TIMESTAMPTZ  DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_caixa_mov_caixa   ON caixa_movimentos (caixa_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_empresa ON caixa_movimentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_pedido  ON caixa_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_data    ON caixa_movimentos (criado_em DESC);

-- ── estoque_movimentos (esperado pela 017) ───────────────────────────────────
ALTER TABLE estoque_movimentos
  ADD COLUMN IF NOT EXISTS empresa_id       UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS produto_id       UUID         REFERENCES produtos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pedido_id        UUID         REFERENCES pedidos(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS usuario_id       UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quantidade       INTEGER,
  ADD COLUMN IF NOT EXISTS estoque_anterior INTEGER,
  ADD COLUMN IF NOT EXISTS estoque_atual    INTEGER,
  ADD COLUMN IF NOT EXISTS motivo           TEXT,
  ADD COLUMN IF NOT EXISTS criado_em        TIMESTAMPTZ  DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_estoque_mov_empresa  ON estoque_movimentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto  ON estoque_movimentos (produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_pedido   ON estoque_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_data     ON estoque_movimentos (criado_em DESC);

-- ── categorias.disponivel (algumas APIs filtram por isso) ────────────────────
-- O seed 004 tenta usar 'ativo'; o app usa 'disponivel'. Garante ambos.
ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS ativo      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS disponivel BOOLEAN DEFAULT true;
