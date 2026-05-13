-- ─────────────────────────────────────────────────────────────────────────────
-- 036 — Integração iFood
-- ─────────────────────────────────────────────────────────────────────────────
-- Credenciais OAuth (client_credentials grant) + token cache + merchants vinculados.
-- Polling de eventos via /events:polling (long-poll 30s).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ifood_config (1 por empresa) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ifood_config (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID         NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
  client_id       TEXT         NOT NULL,
  client_secret   TEXT         NOT NULL,           -- encrypt no app
  merchant_id     TEXT,                             -- ID do restaurante no iFood
  ambiente        VARCHAR(20)  NOT NULL DEFAULT 'producao',  -- 'sandbox' | 'producao'
  ativo           BOOLEAN      NOT NULL DEFAULT true,
  polling_ativo   BOOLEAN      NOT NULL DEFAULT false,
  -- Cache do access token
  access_token    TEXT,
  token_expira_em TIMESTAMPTZ,
  -- Estado
  ultimo_polling_em  TIMESTAMPTZ,
  ultimo_evento_id   TEXT,
  ultimo_erro        TEXT,
  ultimo_erro_em     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ifood_eventos (raw + processado, p/ replay) ──────────────────────────────
CREATE TABLE IF NOT EXISTS ifood_eventos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evento_id       TEXT         NOT NULL,           -- id do evento no iFood
  tipo            VARCHAR(50)  NOT NULL,           -- PLACED, CONFIRMED, CANCELLED, etc
  pedido_ifood_id TEXT,                             -- order id do iFood
  pedido_id       UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  payload         JSONB        NOT NULL,
  ack_em          TIMESTAMPTZ,                     -- quando deu ack para iFood
  processado_em   TIMESTAMPTZ,
  erro            TEXT,
  recebido_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ifood_evento_unique UNIQUE (empresa_id, evento_id)
);

CREATE INDEX IF NOT EXISTS idx_ifood_evt_empresa ON ifood_eventos (empresa_id, recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_ifood_evt_pedido  ON ifood_eventos (pedido_ifood_id);
CREATE INDEX IF NOT EXISTS idx_ifood_evt_pendente ON ifood_eventos (empresa_id)
  WHERE processado_em IS NULL;

-- ── pedidos: ID do iFood (origem='ifood') ────────────────────────────────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS ifood_order_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_ifood
  ON pedidos (ifood_order_id) WHERE ifood_order_id IS NOT NULL;
