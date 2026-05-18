-- 074_terminais_pagamento.sql
-- Terminais de pagamento (maquininhas/pinpads/TEF) por empresa.
-- Arquitetura driver-based: cada gateway/banco é um "driver" plugável.

CREATE TABLE IF NOT EXISTS empresa_terminais (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,                       -- Ex: "Caixa 1", "Totem Drive Thru"
  driver          TEXT NOT NULL,                       -- cielo_api | cielo_tef_intent | cielo_lio | sitef_intent | paygo_intent | autopay_intent | stone_api | pagseguro_api | etc
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  padrao_pdv      BOOLEAN NOT NULL DEFAULT FALSE,      -- usado por padrão no PDV
  padrao_totem    BOOLEAN NOT NULL DEFAULT FALSE,      -- usado por padrão no totem
  credenciais     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- merchant_id, client_id, secret, package_name, etc (cifrado nas APIs)
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- timeouts, qty parcelas, etc
  observacao      TEXT,
  created_by      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_terminais_empresa ON empresa_terminais(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_terminais_driver  ON empresa_terminais(driver);

-- Garante: 1 padrão de cada tipo por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_padrao_pdv
  ON empresa_terminais(empresa_id) WHERE padrao_pdv = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_padrao_totem
  ON empresa_terminais(empresa_id) WHERE padrao_totem = TRUE;

-- ─── Transações de terminal (auditoria + status) ─────────────
CREATE TABLE IF NOT EXISTS terminal_transacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  terminal_id      UUID REFERENCES empresa_terminais(id) ON DELETE SET NULL,
  pedido_id        UUID,                                -- opcional, ligar a um pedido
  origem           TEXT NOT NULL,                       -- pdv | totem | api
  driver           TEXT NOT NULL,
  metodo           TEXT NOT NULL,                       -- credito | debito | voucher | pix | qrcode
  parcelas         INT  NOT NULL DEFAULT 1,
  valor            NUMERIC(10,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente','processando','aprovada','recusada','cancelada','expirada','erro')),
  -- Identificação no gateway
  gateway_tx_id    TEXT,                                -- payment_id, NSU, paymentId, etc
  authorization_id TEXT,                                -- código de autorização do banco
  -- Resultado
  bandeira         TEXT,                                -- visa, mastercard, elo, etc
  ultimos_4        TEXT,
  qr_code          TEXT,                                -- pix copia-cola se aplicável
  qr_code_img      TEXT,                                -- base64 ou URL
  raw_request      JSONB,                               -- payload enviado (sanitizado)
  raw_response     JSONB,                               -- resposta do gateway (sanitizada)
  erro_mensagem    TEXT,
  -- Audit
  iniciado_por     UUID REFERENCES usuarios(id),
  iniciado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em     TIMESTAMPTZ,
  cancelado_em     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tt_empresa  ON terminal_transacoes(empresa_id, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tt_pedido   ON terminal_transacoes(pedido_id);
CREATE INDEX IF NOT EXISTS idx_tt_status   ON terminal_transacoes(status, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tt_gateway  ON terminal_transacoes(driver, gateway_tx_id);
