-- Migration 013 — Módulo Caixa (PDV: abertura, fechamento, sangria, reforço)

CREATE TABLE IF NOT EXISTS caixas (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_abertura_id    UUID         NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  usuario_fechamento_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Valores em reais
  valor_abertura         NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_esperado         NUMERIC(10,2),                 -- calculado no fechamento
  valor_fechamento       NUMERIC(10,2),                 -- informado pelo operador
  diferenca              NUMERIC(10,2),                 -- fechamento - esperado

  -- Status: aberto | fechado
  status                 VARCHAR(20)  NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'fechado')),

  observacoes            TEXT,
  observacoes_fechamento TEXT,

  aberto_em              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  fechado_em             TIMESTAMPTZ,

  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Apenas um caixa aberto por empresa (constraint parcial)
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_aberto_unique
  ON caixas (empresa_id) WHERE status = 'aberto';

CREATE INDEX IF NOT EXISTS idx_caixas_empresa  ON caixas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_caixas_status   ON caixas (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_caixas_aberto   ON caixas (aberto_em DESC);

-- Movimentos: sangria (saque), reforço (aporte), venda (gerado por pedido)
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id      UUID         NOT NULL REFERENCES caixas(id) ON DELETE CASCADE,
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id    UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_id     UUID         REFERENCES pedidos(id)  ON DELETE SET NULL,

  -- sangria | reforco | venda | estorno
  tipo          VARCHAR(20)  NOT NULL
    CHECK (tipo IN ('sangria', 'reforco', 'venda', 'estorno')),

  -- Forma de pagamento (só relevante para venda)
  forma_pagamento VARCHAR(30),    -- dinheiro | pix | credito | debito | outro

  -- Valor positivo SEMPRE (o sinal vem do tipo)
  valor         NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  descricao     TEXT,

  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caixa_mov_caixa   ON caixa_movimentos (caixa_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_empresa ON caixa_movimentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_pedido  ON caixa_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_data    ON caixa_movimentos (criado_em DESC);

-- Trigger para updated_at em caixas
DROP TRIGGER IF EXISTS tg_caixas_updated_at ON caixas;
CREATE TRIGGER tg_caixas_updated_at
  BEFORE UPDATE ON caixas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
