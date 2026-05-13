-- ─────────────────────────────────────────────────────────────────────────────
-- 033 — API keys (autenticação alternativa ao JWT, para integrações externas)
-- ─────────────────────────────────────────────────────────────────────────────
-- Empresa gera 1+ API keys com escopo limitado.
-- Cliente envia: Authorization: Bearer apk_xxxxxx
-- Backend faz hash SHA-256 e busca por match.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(100) NOT NULL,
  prefix        VARCHAR(12)  NOT NULL,           -- 'apk_xxxxxx' (visível, p/ identificar)
  key_hash      VARCHAR(64)  NOT NULL UNIQUE,    -- SHA-256 da key completa
  scopes        JSONB        NOT NULL DEFAULT '["read"]'::jsonb,
    -- 'read' (GET only), 'write' (POST/PATCH/DELETE), 'admin' (config)
  ativo         BOOLEAN      NOT NULL DEFAULT true,
  ultimo_uso_em TIMESTAMPTZ,
  ultimo_uso_ip INET,
  expira_em     TIMESTAMPTZ,
  criado_por    UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_empresa ON api_keys (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON api_keys (key_hash) WHERE deleted_at IS NULL AND ativo = true;
