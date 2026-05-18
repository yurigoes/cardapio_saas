-- 073_contatos_institucional.sql
-- Solicitações de contato do site institucional + comprovantes de pagamento

CREATE TABLE IF NOT EXISTS contatos_institucional (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL,
  telefone     TEXT,
  empresa      TEXT,
  mensagem     TEXT NOT NULL,
  ip           INET,
  user_agent   TEXT,
  origem       TEXT DEFAULT 'site_institucional',
  status       TEXT NOT NULL DEFAULT 'novo'
                  CHECK (status IN ('novo','lido','respondido','convertido','spam')),
  respondido_por  UUID REFERENCES usuarios(id),
  respondido_em   TIMESTAMPTZ,
  resposta_texto  TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contatos_status     ON contatos_institucional(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contatos_created    ON contatos_institucional(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contatos_email      ON contatos_institucional(email);

-- ─── Anexos de comprovante/NF para mensalidades e cobranças avulsas ──
ALTER TABLE mensalidades
  ADD COLUMN IF NOT EXISTS nota_fiscal_url  TEXT,
  ADD COLUMN IF NOT EXISTS nota_fiscal_nome TEXT,
  ADD COLUMN IF NOT EXISTS nota_fiscal_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_fiscal_por  UUID REFERENCES usuarios(id);

ALTER TABLE cobrancas_avulsas
  ADD COLUMN IF NOT EXISTS nota_fiscal_url  TEXT,
  ADD COLUMN IF NOT EXISTS nota_fiscal_nome TEXT,
  ADD COLUMN IF NOT EXISTS nota_fiscal_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_fiscal_por  UUID REFERENCES usuarios(id);
