-- Migration 014 — Configuração de caixa obrigatório

-- Quando true, o totem só aceita pedidos local/retirada se houver caixa aberto.
-- Delivery é exceção (pedidos vêm de fora, não passam por caixa físico).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS caixa_obrigatorio BOOLEAN NOT NULL DEFAULT FALSE;
