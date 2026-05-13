-- ─────────────────────────────────────────────────────────────────────────────
-- 029 — pedido_pagamentos: pagamentos múltiplos por pedido
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite "fechar conta" com divisão de pagamento (R$ 50 pix + R$ 30 dinheiro).
-- Cada linha é UM pagamento. A soma deve igualar pedidos.total.
--
-- formas:
--   pix | dinheiro | credito | debito | vale | outro
--
-- Vale (crediário) é registrado mas a regra de débito do limite vem em F2.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pedido_pagamentos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID         NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  forma           VARCHAR(20)  NOT NULL
    CHECK (forma IN ('pix','dinheiro','credito','debito','vale','outro')),

  valor           NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  troco_para      NUMERIC(10,2),       -- só para 'dinheiro' (valor entregue pelo cliente)
  observacoes     TEXT,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedpag_pedido  ON pedido_pagamentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedpag_empresa ON pedido_pagamentos (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedpag_forma   ON pedido_pagamentos (empresa_id, forma);
