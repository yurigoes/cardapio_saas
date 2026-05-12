-- Migration 016 — Impressão automática do cupom do cliente

-- Quando true, /painel/pedidos abre popup de impressão automaticamente
-- para cada pedido novo (cupom não-fiscal completo, com totais).
-- Útil para restaurantes que entregam o cupom junto com o pedido.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS imprimir_cupom_auto BOOLEAN NOT NULL DEFAULT FALSE;
