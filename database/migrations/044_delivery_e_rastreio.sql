-- ═══════════════════════════════════════════════════════════════
--  Migration 044 — flags de delivery + tokens de rastreio
-- ═══════════════════════════════════════════════════════════════

-- Aceita pedidos delivery fora das zonas cadastradas?
-- Default false — protege contra entregas fora de área
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS delivery_aceita_fora_zona BOOLEAN DEFAULT false;

-- Tema do totem (claro / escuro / auto)
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS totem_tema VARCHAR(10) DEFAULT 'escuro';
-- 'claro' | 'escuro' | 'auto'

-- Tokens de rastreio público pro cliente acompanhar entrega
-- Cliente recebe link via WhatsApp; expira ao entregar pedido
CREATE TABLE IF NOT EXISTS rastreio_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id   UUID         NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  token       VARCHAR(40)  NOT NULL UNIQUE,
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  expira_em   TIMESTAMPTZ,            -- NULL = sem expiração até pedido entregue
  enviado_em  TIMESTAMPTZ,
  ultimo_acesso TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- 1 token ativo por pedido
  UNIQUE (pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_rastreio_lookup ON rastreio_tokens (token, ativo);
