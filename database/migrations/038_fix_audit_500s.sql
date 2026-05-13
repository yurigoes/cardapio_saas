-- ═══════════════════════════════════════════════════════════════
--  Migration 038 — corrige colunas que faltavam, identificadas
--  pelo audit-routes.js (4 erros 500 em /cozinha/pedidos e
--  /admin/observability)
--
--  Idempotente: usa ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--  Pode rodar quantas vezes quiser sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════

-- ── pedido_itens — colunas usadas pelo /api/cozinha/pedidos ────
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS status         VARCHAR(20)  DEFAULT 'pendente';
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS setor_producao VARCHAR(20);
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS adicionais     JSONB        DEFAULT '[]'::jsonb;
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS complementos   JSONB        DEFAULT '[]'::jsonb;
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS observacoes    TEXT;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_setor  ON pedido_itens (setor_producao) WHERE setor_producao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedido_itens_status ON pedido_itens (status);

-- ── pedidos — colunas usadas no KDS / fluxo cozinha ────────────
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aceito_em      TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS preparando_em  TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pronto_em      TIMESTAMPTZ;

-- ── error_log — garante que existe (caso migration 034 não tenha rodado) ─
CREATE TABLE IF NOT EXISTS error_log (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         REFERENCES empresas(id) ON DELETE SET NULL,
  usuario_id   UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  level        VARCHAR(10)  NOT NULL DEFAULT 'error',
  origem       VARCHAR(20)  NOT NULL DEFAULT 'server',
  message      TEXT         NOT NULL,
  stack        TEXT,
  rota         VARCHAR(255),
  metodo       VARCHAR(10),
  user_agent   TEXT,
  ip_origem    INET,
  request_id   VARCHAR(40),
  contexto     JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_log_recent  ON error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_empresa ON error_log (empresa_id, created_at DESC) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_log_level   ON error_log (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_origem  ON error_log (origem, created_at DESC);
