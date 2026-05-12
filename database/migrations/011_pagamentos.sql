-- Migration 011 — Tabela de pagamentos e índices de suporte

-- Tabela central de cobranças (gateway → pedido)
CREATE TABLE IF NOT EXISTS pagamentos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id     UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  gateway_slug  VARCHAR(50)  NOT NULL,
  gateway_id    VARCHAR(255) NOT NULL,          -- ID do pagamento no gateway externo
  metodo        VARCHAR(30)  NOT NULL DEFAULT 'pix',
  status        VARCHAR(30)  NOT NULL DEFAULT 'pendente',
  valor         NUMERIC(10,2) NOT NULL,
  gateway_data  JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT pagamentos_gateway_unique UNIQUE (gateway_slug, gateway_id)
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_empresa   ON pagamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido    ON pagamentos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_gateway   ON pagamentos(gateway_slug, gateway_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status    ON pagamentos(status);

-- Adiciona webhook_secret aos gateways
ALTER TABLE gateways_config
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Índice para busca rápida de pedido por external_reference (MP)
-- Quando o webhook chega, buscamos pelo pedido_id direto via pagamentos.gateway_id
CREATE INDEX IF NOT EXISTS idx_pedidos_id_empresa ON pedidos(id, empresa_id);
