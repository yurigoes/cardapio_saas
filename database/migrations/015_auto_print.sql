-- Migration 015 — Impressão automática na cozinha (KDS)

-- Quando true, KDS abre popup de impressão automaticamente para cada
-- pedido novo que entra (status confirmado/preparando).
-- Default: FALSE (não imprime sem ação do operador).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS imprimir_cozinha_auto BOOLEAN NOT NULL DEFAULT FALSE;
