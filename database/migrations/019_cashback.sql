-- Migration 019 — Cashback (créditos em R$ por compra)

-- Configuração da empresa
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS cashback_ativo       BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cashback_percentual  NUMERIC(5,2)  NOT NULL DEFAULT 0
    CHECK (cashback_percentual >= 0 AND cashback_percentual <= 100);

-- Saldo de cashback do cliente (acumulado em R$)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS saldo_cashback NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (saldo_cashback >= 0);

-- Histórico de movimentos de cashback (auditoria)
CREATE TABLE IF NOT EXISTS cashback_movimentos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id  UUID         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pedido_id   UUID         REFERENCES pedidos(id) ON DELETE SET NULL,

  -- credito (ganhou em compra) | debito (usou em compra) | ajuste (correção manual)
  tipo        VARCHAR(20)  NOT NULL
    CHECK (tipo IN ('credito', 'debito', 'ajuste')),

  -- Sempre positivo (sinal vem do tipo)
  valor       NUMERIC(10,2) NOT NULL CHECK (valor > 0),

  -- Snapshot do saldo após movimento
  saldo_anterior  NUMERIC(10,2),
  saldo_atual     NUMERIC(10,2),

  motivo      TEXT,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cb_mov_empresa  ON cashback_movimentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cb_mov_cliente  ON cashback_movimentos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cb_mov_pedido   ON cashback_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_cb_mov_data     ON cashback_movimentos (criado_em DESC);
