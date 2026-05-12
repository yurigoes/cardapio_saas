-- ─────────────────────────────────────────────────────────────────────────────
-- 027 — Endereço do cliente (delivery) e do pedido
-- ─────────────────────────────────────────────────────────────────────────────
-- Necessário para fluxo delivery no totem/cardápio público:
--   - clientes.endereco: JSONB, último endereço usado (auto-fill em retornos)
--   - pedidos.cliente_endereco: JSONB, snapshot do endereço usado neste pedido
--
-- Formato esperado:
--   { cep, rua, numero, complemento, bairro, cidade, uf, referencia }
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS endereco JSONB;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cliente_endereco JSONB;
