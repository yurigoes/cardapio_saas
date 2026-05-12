-- Migration 017 — Movimentos de estoque (auditoria + entradas/saídas)

CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id  UUID         NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  pedido_id   UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  -- saida | entrada | ajuste | perda
  tipo        VARCHAR(20)  NOT NULL
    CHECK (tipo IN ('saida', 'entrada', 'ajuste', 'perda')),

  -- Quantidade SEMPRE positiva (sinal vem do tipo)
  quantidade  INTEGER      NOT NULL CHECK (quantidade > 0),

  -- Snapshot do estoque após o movimento (para histórico)
  estoque_anterior  INTEGER,
  estoque_atual     INTEGER,

  motivo      TEXT,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_empresa  ON estoque_movimentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto  ON estoque_movimentos (produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_pedido   ON estoque_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_data     ON estoque_movimentos (criado_em DESC);
