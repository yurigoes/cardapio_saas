-- Migration 020 — Log de webhooks recebidos (todos os gateways)

CREATE TABLE IF NOT EXISTS webhook_log (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         REFERENCES empresas(id) ON DELETE SET NULL,

  gateway_slug  VARCHAR(50)  NOT NULL,           -- mercadopago, pagarme, asaas, stone
  evento        VARCHAR(100),                    -- ex: payment.updated, order.paid

  -- ID externo do recurso (charge_id, payment_id, etc)
  recurso_id    VARCHAR(255),
  pedido_id     UUID         REFERENCES pedidos(id) ON DELETE SET NULL,

  -- Resultado do processamento
  -- recebido | processado | ignorado | falha | assinatura_invalida
  resultado     VARCHAR(30)  NOT NULL DEFAULT 'recebido',
  http_status   INTEGER,
  mensagem      TEXT,

  -- Payload completo (para auditoria/replay)
  payload       JSONB,

  -- Headers selecionados (signature, content-type)
  headers       JSONB,

  duracao_ms    INTEGER,
  ip_origem     INET,

  recebido_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wh_log_empresa   ON webhook_log (empresa_id);
CREATE INDEX IF NOT EXISTS idx_wh_log_gateway   ON webhook_log (gateway_slug);
CREATE INDEX IF NOT EXISTS idx_wh_log_resultado ON webhook_log (resultado);
CREATE INDEX IF NOT EXISTS idx_wh_log_data      ON webhook_log (recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_wh_log_pedido    ON webhook_log (pedido_id);
