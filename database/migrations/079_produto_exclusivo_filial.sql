-- 079_produto_exclusivo_filial.sql
-- Permite marcar um produto como EXCLUSIVO de uma filial específica,
-- mesmo quando a rede tem cardápio sincronizado.
-- Útil pra promoções regionais, produtos sazonais por filial, etc.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS exclusivo_filial_id UUID REFERENCES empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_exclusivo
  ON produtos(exclusivo_filial_id) WHERE exclusivo_filial_id IS NOT NULL;

COMMENT ON COLUMN produtos.exclusivo_filial_id IS
  'Quando preenchido, produto só aparece nesta filial específica (mesmo se rede tem cardápio sincronizado)';
