-- ─────────────────────────────────────────────────────────────────────────────
-- 034 — Log de erros centralizado (observability self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
-- Recebe erros tanto do server (uncaught + logados) quanto do client (window.onerror).
-- Usado por /admin/observability e endpoint POST /api/observability/error.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS error_log (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         REFERENCES empresas(id) ON DELETE SET NULL,
  usuario_id   UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  level        VARCHAR(10)  NOT NULL DEFAULT 'error',
    -- 'error' | 'warn' | 'fatal'
  origem       VARCHAR(20)  NOT NULL DEFAULT 'server',
    -- 'server' | 'client'
  message      TEXT         NOT NULL,
  stack        TEXT,
  rota         VARCHAR(255),     -- URL ou route handler
  metodo       VARCHAR(10),      -- GET/POST/...
  user_agent   TEXT,
  ip_origem    INET,
  request_id   VARCHAR(40),      -- pra correlacionar
  contexto     JSONB,            -- payload extra (params, body, etc)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_log_recent     ON error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_empresa    ON error_log (empresa_id, created_at DESC) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_log_level      ON error_log (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_origem     ON error_log (origem, created_at DESC);

-- (cleanup index removido — NOW() não é IMMUTABLE; cron usa idx_error_log_recent)
