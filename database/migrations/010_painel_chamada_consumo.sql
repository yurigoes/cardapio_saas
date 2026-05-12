-- Migration 010 — Painel de chamada, tipo_consumo, pontos por produto

-- ── Tipo de consumo e forma de pagamento nos pedidos ─────────────────────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tipo_consumo    VARCHAR(20)  DEFAULT 'local'
    CHECK (tipo_consumo IN ('local','retirada','delivery')),
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50);

-- ── Horário de funcionamento na empresa (se não veio em migração anterior) ───
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS horario_abertura   TIME,
  ADD COLUMN IF NOT EXISTS horario_fechamento TIME;

-- ── Pontos de fidelidade por produto e por categoria ─────────────────────────
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS pontos_fidelidade INTEGER DEFAULT 0;

ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS pontos_fidelidade INTEGER DEFAULT 0;

-- ── Painel de chamada de clientes ─────────────────────────────────────────────
-- Registra cada chamada feita pela cozinha para o painel TV
CREATE TABLE IF NOT EXISTS chamados_painel (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id    UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  numero       INTEGER      NOT NULL,
  cliente_nome VARCHAR(255),
  balcao       VARCHAR(50)  DEFAULT 'Balcão 1',
  status       VARCHAR(20)  NOT NULL DEFAULT 'chamando'
    CHECK (status IN ('chamando','atendido')),
  chamado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atendido_em  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chamados_empresa    ON chamados_painel(empresa_id, chamado_em DESC);
CREATE INDEX IF NOT EXISTS idx_chamados_pedido     ON chamados_painel(pedido_id);

-- ── Motoboy vinculado ao pedido (se migration anterior não criou) ─────────────
-- (apenas safety — Migration 008 já adicionou estas colunas)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS motoboy_id UUID;

-- ── Índice para chamadas recentes ─────────────────────────────────────────────
-- Para o painel TV buscar os últimos 20 chamados rapidamente
CREATE INDEX IF NOT EXISTS idx_chamados_recent
  ON chamados_painel(empresa_id, chamado_em DESC)
  WHERE status = 'chamando';
