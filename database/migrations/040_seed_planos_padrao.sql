-- ═══════════════════════════════════════════════════════════════
--  Migration 040 — seed de planos padrão (Starter, Pro, Premium)
--  Idempotente: só insere se não houver nenhum plano cadastrado.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO planos (nome, descricao, preco_mensal, modulos, destaque, ativo)
SELECT
  'Starter',
  'Pra restaurantes pequenos começando — só o essencial pra organizar pedidos.',
  79.90,
  '["balcao","mesa","relatorios_basicos"]'::jsonb,
  false,
  true
WHERE NOT EXISTS (SELECT 1 FROM planos WHERE LOWER(nome) = 'starter');

INSERT INTO planos (nome, descricao, preco_mensal, modulos, destaque, ativo)
SELECT
  'Pro',
  'O queridinho — tudo pra você operar pedido no balcão, mesa, delivery e cozinha.',
  149.90,
  '["balcao","mesa","delivery","cozinha_kds","financeiro","cupom","crm","relatorios_basicos"]'::jsonb,
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM planos WHERE LOWER(nome) = 'pro');

INSERT INTO planos (nome, descricao, preco_mensal, modulos, destaque, ativo)
SELECT
  'Premium',
  'Tudo do Pro + Totem de autoatendimento, controle de estoque e iFood integrado.',
  299.90,
  '["balcao","mesa","delivery","cozinha_kds","totem","financeiro","estoque","cupom","crm","relatorios_basicos","ifood"]'::jsonb,
  false,
  true
WHERE NOT EXISTS (SELECT 1 FROM planos WHERE LOWER(nome) = 'premium');
