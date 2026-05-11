-- Migration 004: Demo seed — empresa de demonstração com todos os módulos ativos
-- Idempotente: usa ON CONFLICT / WHERE NOT EXISTS para não duplicar dados

-- Plano Demo — Full (todos os módulos)
INSERT INTO planos (id, nome, descricao, preco, periodo, modulos, limites, ativo, destaque)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Plano Demo — Full',
  'Plano de demonstração com todos os módulos e limites ilimitados',
  0,
  'mensal',
  '["cardapio","pedidos","mesas","cozinha","kds","totem","garcom","delivery","financeiro","relatorios","estoque","clientes","cupons","integracoes","gateways"]',
  '{"usuarios": -1, "produtos": -1, "mesas": -1, "pedidos_mes": -1}',
  true,
  false
)
ON CONFLICT (id) DO NOTHING;

-- Empresa demo
INSERT INTO empresas (
  id, nome_fantasia, razao_social, cnpj, slug, subdominio,
  cor_primaria, cor_secundaria,
  whatsapp, telefone, email,
  plano_id, status,
  modulos_ativos
)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  'Restaurante Demo',
  'Demo Sistemas LTDA',
  '00000000000191',
  'demo',
  'demo',
  '#10B981',
  '#0F172A',
  '5511999999999',
  '1132000000',
  'demo@cardapiosystem.com',
  '00000000-0000-0000-0000-000000000001',
  'ativo',
  '["cardapio","pedidos","mesas","cozinha","kds","totem","garcom","delivery","financeiro","relatorios","estoque","clientes","cupons","integracoes","gateways"]'
)
ON CONFLICT (slug) DO NOTHING;

-- Categorias da empresa demo
DO $$
DECLARE
  v_empresa_id UUID := '00000000-0000-0000-0001-000000000001';
BEGIN
  INSERT INTO categorias (nome, descricao, ordem, empresa_id, ativo)
  SELECT 'Entradas',    'Petiscos e entradas',    1, v_empresa_id, true
  WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Entradas');

  INSERT INTO categorias (nome, descricao, ordem, empresa_id, ativo)
  SELECT 'Pratos Principais', 'Nossos pratos especiais', 2, v_empresa_id, true
  WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Pratos Principais');

  INSERT INTO categorias (nome, descricao, ordem, empresa_id, ativo)
  SELECT 'Bebidas',     'Refrigerantes, sucos e mais', 3, v_empresa_id, true
  WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Bebidas');

  INSERT INTO categorias (nome, descricao, ordem, empresa_id, ativo)
  SELECT 'Sobremesas',  'Doces e sobremesas',     4, v_empresa_id, true
  WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Sobremesas');
END $$;

-- Produtos da empresa demo
DO $$
DECLARE
  v_empresa_id UUID := '00000000-0000-0000-0001-000000000001';
  v_cat_entradas UUID;
  v_cat_pratos   UUID;
  v_cat_bebidas  UUID;
  v_cat_sobremesas UUID;
BEGIN
  SELECT id INTO v_cat_entradas    FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Entradas';
  SELECT id INTO v_cat_pratos      FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Pratos Principais';
  SELECT id INTO v_cat_bebidas     FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Bebidas';
  SELECT id INTO v_cat_sobremesas  FROM categorias WHERE empresa_id = v_empresa_id AND nome = 'Sobremesas';

  -- Entradas
  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Bruschetta', 'Pão italiano grelhado com tomate, manjericão e azeite', 18.90, v_cat_entradas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Bruschetta');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Caldo de Feijão', 'Caldo cremoso com linguiça e torresmo', 14.50, v_cat_entradas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Caldo de Feijão');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Bolinho de Bacalhau', 'Porção com 6 unidades e molho tártaro', 29.90, v_cat_entradas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Bolinho de Bacalhau');

  -- Pratos Principais
  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Filé à Parmegiana', 'Filé empanado com molho de tomate e queijo gratinado, acompanha arroz e fritas', 59.90, v_cat_pratos, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Filé à Parmegiana');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Frango Grelhado', 'Peito de frango grelhado com legumes salteados e arroz integral', 42.90, v_cat_pratos, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Frango Grelhado');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Moqueca de Camarão', 'Moqueca baiana com camarões, leite de coco e azeite de dendê', 79.90, v_cat_pratos, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Moqueca de Camarão');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Picanha na Brasa', 'Picanha grelhada servida com arroz, feijão, vinagrete e farofa', 89.90, v_cat_pratos, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Picanha na Brasa');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Risoto de Funghi', 'Risoto cremoso com cogumelos funghi secchi e parmesão', 52.90, v_cat_pratos, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Risoto de Funghi');

  -- Bebidas
  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Refrigerante', 'Lata 350ml — Coca-Cola, Guaraná, Sprite', 7.00, v_cat_bebidas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Refrigerante');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Suco Natural', 'Copo 400ml — laranja, limão, maracujá ou goiaba', 12.00, v_cat_bebidas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Suco Natural');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Água Mineral', 'Garrafa 500ml com ou sem gás', 5.00, v_cat_bebidas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Água Mineral');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Cerveja Long Neck', 'Heineken, Budweiser ou Itaipava 330ml', 14.00, v_cat_bebidas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Cerveja Long Neck');

  -- Sobremesas
  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Pudim de Leite', 'Pudim caseiro com calda de caramelo', 16.90, v_cat_sobremesas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Pudim de Leite');

  INSERT INTO produtos (nome, descricao, preco, categoria_id, empresa_id, ativo, disponivel)
  SELECT 'Petit Gateau', 'Bolinho quente de chocolate com sorvete de creme', 22.90, v_cat_sobremesas, v_empresa_id, true, true
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE empresa_id = v_empresa_id AND nome = 'Petit Gateau');
END $$;

-- Mesas da empresa demo (10 mesas)
DO $$
DECLARE
  v_empresa_id UUID := '00000000-0000-0000-0001-000000000001';
  i INT;
BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO mesas (numero, capacidade, status, empresa_id)
    SELECT i, 4, 'livre', v_empresa_id
    WHERE NOT EXISTS (SELECT 1 FROM mesas WHERE empresa_id = v_empresa_id AND numero = i);
  END LOOP;
END $$;

-- Usuários da empresa demo
-- Senha: Demo@1234!  (hash bcrypt rounds=12)
INSERT INTO usuarios (nome, email, senha_hash, role, empresa_id, ativo)
SELECT 'Administrador Demo', 'admin@demo.com',
  '$2a$12$GiY/Tb25v0szjAEICrYgH.TMt28zniNr3HocKkx5wKww0H3.7y/OC',
  'admin', '00000000-0000-0000-0001-000000000001', true
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@demo.com');

INSERT INTO usuarios (nome, email, senha_hash, role, empresa_id, ativo)
SELECT 'Garçom Demo', 'garcom@demo.com',
  '$2a$12$GiY/Tb25v0szjAEICrYgH.TMt28zniNr3HocKkx5wKww0H3.7y/OC',
  'garcom', '00000000-0000-0000-0001-000000000001', true
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'garcom@demo.com');

INSERT INTO usuarios (nome, email, senha_hash, role, empresa_id, ativo)
SELECT 'Cozinha Demo', 'cozinha@demo.com',
  '$2a$12$GiY/Tb25v0szjAEICrYgH.TMt28zniNr3HocKkx5wKww0H3.7y/OC',
  'cozinha', '00000000-0000-0000-0001-000000000001', true
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'cozinha@demo.com');
