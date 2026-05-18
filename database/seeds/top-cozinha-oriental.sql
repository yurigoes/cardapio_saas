-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Cardápio da empresa "Top Cozinha Oriental"
-- Gera categorias + produtos com variações (sem imagens — subir depois)
--
-- IDEMPOTENTE: usa ON CONFLICT DO NOTHING via UNIQUE (empresa_id, nome).
-- Se você já tiver alguns produtos cadastrados com o mesmo nome, eles
-- são pulados (a query nunca duplica).
--
-- COMO RODAR:
--   docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas \
--     < /opt/cardapio_saas/database/seeds/top-cozinha-oriental.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_empresa_id  UUID;
  v_rede_id     UUID;
  v_cat         RECORD;
  v_ordem       INT := 0;
BEGIN
  -- Pega empresa + rede
  SELECT id, rede_id INTO v_empresa_id, v_rede_id
    FROM empresas
   WHERE slug = 'top-cozinha-oriental' AND deleted_at IS NULL
   LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa top-cozinha-oriental não encontrada';
  END IF;

  RAISE NOTICE 'Empresa: %, rede: %', v_empresa_id, v_rede_id;

  -- ── CATEGORIAS ─────────────────────────────────────────────────────────────
  -- Cria categorias (não duplica se já existir nome igual)
  INSERT INTO categorias (empresa_id, rede_id, nome, descricao, ordem, ativo, disponivel)
  VALUES
    (v_empresa_id, v_rede_id, 'Rolinhos',                  NULL, 10, true, true),
    (v_empresa_id, v_rede_id, 'Yakissoba',                 NULL, 20, true, true),
    (v_empresa_id, v_rede_id, 'Pratos Especiais',          NULL, 30, true, true),
    (v_empresa_id, v_rede_id, 'Sushi (8 peças)',           NULL, 40, true, true),
    (v_empresa_id, v_rede_id, 'Sushi Especial (8 peças)',  NULL, 50, true, true),
    (v_empresa_id, v_rede_id, 'Sashimi',                   NULL, 60, true, true),
    (v_empresa_id, v_rede_id, 'Combinado Frio',            NULL, 70, true, true),
    (v_empresa_id, v_rede_id, 'Temaki sem Cream Cheese',   NULL, 80, true, true),
    (v_empresa_id, v_rede_id, 'Temaki com Cream Cheese',   NULL, 90, true, true),
    (v_empresa_id, v_rede_id, 'Hot Temaki',                NULL, 100, true, true),
    (v_empresa_id, v_rede_id, 'Temaki Maçaricado',         NULL, 110, true, true),
    (v_empresa_id, v_rede_id, 'Combinado Quente',          NULL, 120, true, true),
    (v_empresa_id, v_rede_id, 'Ceviche',                   NULL, 130, true, true),
    (v_empresa_id, v_rede_id, 'Cervejas',                  NULL, 140, true, true),
    (v_empresa_id, v_rede_id, 'Refrigerantes e Outros',    NULL, 150, true, true)
  ON CONFLICT DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Função utilitária local pra inserir produto evitando duplicata por nome
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _seed_top_oriental_insert(
  p_cat_nome  TEXT,
  p_nome      TEXT,
  p_desc      TEXT,
  p_preco     NUMERIC,
  p_variacoes JSONB DEFAULT '{"grupos":[]}'::jsonb
) RETURNS VOID AS $$
DECLARE
  v_empresa_id UUID;
  v_rede_id    UUID;
  v_cat_id     UUID;
BEGIN
  SELECT id, rede_id INTO v_empresa_id, v_rede_id
    FROM empresas WHERE slug = 'top-cozinha-oriental' AND deleted_at IS NULL;

  SELECT id INTO v_cat_id
    FROM categorias
   WHERE empresa_id = v_empresa_id AND nome = p_cat_nome AND deleted_at IS NULL
   LIMIT 1;

  IF v_cat_id IS NULL THEN
    RAISE NOTICE 'categoria "%" não achada — pulando "%"', p_cat_nome, p_nome;
    RETURN;
  END IF;

  -- Skip if already exists
  IF EXISTS (
    SELECT 1 FROM produtos
     WHERE empresa_id = v_empresa_id AND nome = p_nome AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO produtos
    (empresa_id, rede_id, categoria_id, nome, descricao, preco,
     disponivel, destaque, tipo, pontos_fidelidade, variacoes)
  VALUES
    (v_empresa_id, v_rede_id, v_cat_id, p_nome, p_desc, p_preco,
     true, false, 'produto', GREATEST(1, FLOOR(p_preco)::INT), p_variacoes);
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLINHOS
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Rolinhos', 'Rolinho de Salmão',           NULL, 9.00);
SELECT _seed_top_oriental_insert('Rolinhos', 'Rolinho de Camarão',          NULL, 9.00);
SELECT _seed_top_oriental_insert('Rolinhos', 'Rolinho de Queijo',           NULL, 7.00);
SELECT _seed_top_oriental_insert('Rolinhos', 'Rolinho de Frango Catupiry',  NULL, 7.00);
SELECT _seed_top_oriental_insert('Rolinhos', 'Rolinho de Romeu e Julieta',  NULL, 7.00);
SELECT _seed_top_oriental_insert('Rolinhos', 'Rolinho Primavera',           NULL, 7.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- YAKISSOBA (variação de tamanho P/M/G/JB)
-- preço base = P; demais tamanhos via preco_extra
-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: monta variação de tamanho com preço de cada
DO $$
DECLARE
  yk RECORD;
BEGIN
  FOR yk IN
    SELECT * FROM (VALUES
      ('Yakissoba Vegetariano',  'Legumes',                                          26, 29, 35, 45),
      ('Yakissoba Misto',        'Carne, frango e legumes',                          29, 33, 38, 48),
      ('Yakissoba Carne',        'Carne e legumes',                                  31, 35, 40, 51),
      ('Yakissoba Frango',       'Frango e legumes',                                 28, 31, 35, 47),
      ('Yakissoba Top',          'Camarão, frango, carne e legumes',                 NULL, 41, 45, 59),
      ('Yakissoba Top Especial', 'Camarão, polvo, frango, carne e legumes',          NULL, 48, 52, 66),
      ('Yakissoba Camarão',      'Camarão e legumes',                                NULL, 37, 43, 55),
      ('Yakissoba Absoluto',     'Camarão, polvo e legumes',                         NULL, 46, 50, 61),
      ('Yakissoba VIP',          'Camarão, polvo, lula e legumes',                   NULL, 50, 55, 66),
      ('Yakissoba Clássico',     'Camarão, polvo, lula, kani e legumes',             NULL, 56, 62, 73),
      ('Yakissoba Magnífico',    'Polvo e legumes',                                  NULL, 50, 58, 70),
      ('Yakissoba Supremo',      'Camarão, polvo, lula, kani, filé de lagosta e legumes', NULL, 66, 75, 90)
    ) AS t(nome, desc_txt, p_p, p_m, p_g, p_jb)
  LOOP
    DECLARE
      v_base   NUMERIC := COALESCE(yk.p_p, yk.p_m);
      v_grupos JSONB;
      v_opcoes JSONB := '[]'::jsonb;
    BEGIN
      IF yk.p_p IS NOT NULL THEN
        v_opcoes := v_opcoes || jsonb_build_object('id','p','nome','P (300g)','preco_extra', 0);
      END IF;
      IF yk.p_m IS NOT NULL THEN
        v_opcoes := v_opcoes || jsonb_build_object('id','m','nome','M (400g)','preco_extra', (yk.p_m - v_base));
      END IF;
      IF yk.p_g IS NOT NULL THEN
        v_opcoes := v_opcoes || jsonb_build_object('id','g','nome','G (500g)','preco_extra', (yk.p_g - v_base));
      END IF;
      IF yk.p_jb IS NOT NULL THEN
        v_opcoes := v_opcoes || jsonb_build_object('id','jb','nome','JB (800g)','preco_extra', (yk.p_jb - v_base));
      END IF;

      v_grupos := jsonb_build_object(
        'grupos', jsonb_build_array(
          jsonb_build_object(
            'id','tamanho','nome','Tamanho','tipo','single',
            'obrigatorio', true, 'min', 1, 'max', 1,
            'opcoes', v_opcoes
          )
        )
      );

      PERFORM _seed_top_oriental_insert('Yakissoba', yk.nome, yk.desc_txt, v_base, v_grupos);
    END;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRATOS ESPECIAIS
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Teppan de Salmão com Camarão',          NULL, 61.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Teppan de Salmão',                      NULL, 51.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Risoto de Frango',                      NULL, 51.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Risoto de Camarão',                     NULL, 57.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Risoto de Camarão (Levemente Apimentado)', NULL, 57.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Frango Xadrez',                         NULL, 51.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Carne Desfiada com Cebola',             NULL, 49.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Polvo com Nira',                        NULL, 61.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Polvo com Brócolis',                    NULL, 60.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Polvo com Camarão, Nira e Brócolis',    NULL, 66.00);
SELECT _seed_top_oriental_insert('Pratos Especiais', 'Camarão com Legumes',                   NULL, 45.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- SUSHI (8 peças)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Sushi (8 peças)', 'Hossomaki Salmão',  NULL, 42.00);
SELECT _seed_top_oriental_insert('Sushi (8 peças)', 'Hossomaki Camarão', NULL, 41.00);
SELECT _seed_top_oriental_insert('Sushi (8 peças)', 'Uramaki Salmão',    NULL, 42.00);
SELECT _seed_top_oriental_insert('Sushi (8 peças)', 'Uramaki Camarão',   NULL, 41.00);
SELECT _seed_top_oriental_insert('Sushi (8 peças)', 'Shake Grill',       NULL, 48.00);
SELECT _seed_top_oriental_insert('Sushi (8 peças)', 'Uramaki Kani',      NULL, 40.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- SUSHI ESPECIAL (8 peças)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Sushi Especial (8 peças)', 'Joe Salmão',  NULL, 56.00);
SELECT _seed_top_oriental_insert('Sushi Especial (8 peças)', 'Joe Camarão', NULL, 54.00);
SELECT _seed_top_oriental_insert('Sushi Especial (8 peças)', 'Hot Roll',    NULL, 51.00);
SELECT _seed_top_oriental_insert('Sushi Especial (8 peças)', 'Shake Couve', NULL, 46.00);
SELECT _seed_top_oriental_insert('Sushi Especial (8 peças)', 'Top Maki',    NULL, 59.00);
SELECT _seed_top_oriental_insert('Sushi Especial (8 peças)', 'Niguiri',     NULL, 46.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- SASHIMI (Salmão — variação de qtd 4/6/10 und)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_grupos JSONB := jsonb_build_object(
    'grupos', jsonb_build_array(
      jsonb_build_object(
        'id','qtd','nome','Quantidade','tipo','single',
        'obrigatorio', true, 'min', 1, 'max', 1,
        'opcoes', jsonb_build_array(
          jsonb_build_object('id','4',  'nome','4 und',  'preco_extra', 0),
          jsonb_build_object('id','6',  'nome','6 und',  'preco_extra', 9),
          jsonb_build_object('id','10', 'nome','10 und', 'preco_extra', 35)
        )
      )
    )
  );
BEGIN
  PERFORM _seed_top_oriental_insert('Sashimi', 'Sashimi de Salmão', 'Fatias frescas de salmão', 34.00, v_grupos);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMBINADO FRIO (variação 12/22/38/50 peças)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_grupos JSONB := jsonb_build_object(
    'grupos', jsonb_build_array(
      jsonb_build_object(
        'id','tamanho','nome','Tamanho','tipo','single',
        'obrigatorio', true, 'min', 1, 'max', 1,
        'opcoes', jsonb_build_array(
          jsonb_build_object('id','12','nome','12 peças', 'preco_extra', 0),
          jsonb_build_object('id','22','nome','22 peças', 'preco_extra', 32),
          jsonb_build_object('id','38','nome','38 peças', 'preco_extra', 72),
          jsonb_build_object('id','50','nome','50 peças', 'preco_extra', 137)
        )
      )
    )
  );
BEGIN
  PERFORM _seed_top_oriental_insert(
    'Combinado Frio', 'Combinado Frio',
    '12 pç: 2 sashimi + 4 niguiri salmão + 4 uramaki camarão + 2 joe camarão | ' ||
    '22 pç: 4 sashimi salmão + 4 niguiri salmão + 4 joe + 4 uramaki salmão + 4 uramaki camarão + 2 hot roll | ' ||
    '38 pç: 5 joe camarão + 4 hot roll + 5 hossomaki salmão + 5 uramaki salmão + 5 uramaki camarão + 5 niguiri + 4 shake couve + 5 sashimi | ' ||
    '50 pç: 6 sashimi + 5 hot roll + 5 top + 5 joe + 5 hossomaki salmão + 5 niguiri + 5 shake couve + 5 uramaki salmão + 5 uramaki camarão + 4 shake grill',
    48.00, v_grupos);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEMAKI SEM CREAM CHEESE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki Salmão',  'Salmão, cebolinha e gergelim',          32.00);
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki Camarão', 'Camarão, cebolinha e gergelim',         31.00);
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki Polvo',   'Polvo, cebolinha e gergelim',           36.00);
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki Kani',    'Kani, cebolinha e gergelim',            29.00);
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki VIP',     'Salmão, camarão, cebolinha e gergelim', 32.00);
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki TOP',     'Salmão, camarão, polvo, cebolinha e gergelim', 39.00);
SELECT _seed_top_oriental_insert('Temaki sem Cream Cheese', 'Temaki Sem Cream Cheese - Adicional sem arroz', NULL, 17.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- TEMAKI COM CREAM CHEESE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Salmão Completo',   'Salmão, cream cheese, cebolinha e gergelim',   35.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Camarão Completo',  'Camarão, cream cheese, cebolinha e gergelim',  34.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Polvo Completo',    'Polvo, cream cheese, cebolinha e gergelim',    40.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Kani Completo',     'Kani, cream cheese, cebolinha e gergelim',     32.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Ebi Shake',         'Salmão, camarão, cream cheese, cebolinha e gergelim', 38.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Shake Grill',       'Salmão grelhado, cream cheese, cebolinha e gergelim', 37.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Ebi Shake Grill',   'Salmão grelhado, camarão empanado, cream cheese, cebolinha e gergelim', 40.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Ebi Fuchi',         'Camarão empanado, cream cheese, cebolinha e gergelim', 41.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Top Oriental',      'Salmão, camarão, polvo, kani, cream cheese, cebolinha e gergelim', 45.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Shake Couve',       'Camarão grelhado, couve frito, cream cheese, cebolinha e gergelim', 39.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Com CC - Adicional sem arroz',    NULL, 17.00);
SELECT _seed_top_oriental_insert('Temaki com Cream Cheese', 'Temaki Com CC - Adicional cream cheese', NULL, 8.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- HOT TEMAKI
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Hot Temaki', 'Hot Salmão',           'Salmão grelhado, cream cheese, cebolinha e gergelim',         42.00);
SELECT _seed_top_oriental_insert('Hot Temaki', 'Hot Camarão',          'Camarão, cream cheese, cebolinha e gergelim',                 41.00);
SELECT _seed_top_oriental_insert('Hot Temaki', 'Hot Salmão e Camarão', 'Salmão grelhado, camarão, cream cheese, cebolinha e gergelim',44.00);
SELECT _seed_top_oriental_insert('Hot Temaki', 'Hot Kani',             'Kani, cream cheese, cebolinha e gergelim',                    38.00);
SELECT _seed_top_oriental_insert('Hot Temaki', 'Hot Top Oriental',     'Salmão grelhado, camarão, polvo, kani, cream cheese, cebolinha e gergelim', 48.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- TEMAKI MAÇARICADO
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Temaki Maçaricado', 'Magnata',         'Salmão, camarão, polvo, cream cheese, cebolinha e gergelim',  79.00);
SELECT _seed_top_oriental_insert('Temaki Maçaricado', 'Flambadão',       'Salmão grelhado, camarão, cream cheese, cebolinha e gergelim',75.00);
SELECT _seed_top_oriental_insert('Temaki Maçaricado', 'Top Flambadão',   'Salmão grelhado, camarão, polvo, cream cheese, cebolinha e gergelim', 82.00);
SELECT _seed_top_oriental_insert('Temaki Maçaricado', 'Magnífico',       'Salmão, cream cheese, cebolinha e gergelim',                  88.00);
SELECT _seed_top_oriental_insert('Temaki Maçaricado', 'Absoluto',        'Salmão grelhado, cream cheese, cebolinha e gergelim',         92.00);
SELECT _seed_top_oriental_insert('Temaki Maçaricado', 'Supremo',         'Salmão grelhado, camarão empanado, cream cheese, cebolinha e gergelim', 99.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- COMBINADO QUENTE (variação 12/22/38)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_grupos JSONB := jsonb_build_object(
    'grupos', jsonb_build_array(
      jsonb_build_object(
        'id','tamanho','nome','Tamanho','tipo','single',
        'obrigatorio', true, 'min', 1, 'max', 1,
        'opcoes', jsonb_build_array(
          jsonb_build_object('id','12','nome','12 peças', 'preco_extra', 0),
          jsonb_build_object('id','22','nome','22 peças', 'preco_extra', 35),
          jsonb_build_object('id','38','nome','38 peças', 'preco_extra', 96)
        )
      )
    )
  );
BEGIN
  PERFORM _seed_top_oriental_insert(
    'Combinado Quente', 'Combinado Quente',
    '12 pç: 4 hot roll + 4 shake couve + 4 top maki | ' ||
    '22 pç: 4 hot roll + 4 shake couve + 4 top maki + 4 shake grill + 4 sashimi maçaricado + 2 joe maçaricado | ' ||
    '38 pç: 5 hot roll + 5 shake couve + 5 top maki + 5 shake grill + 2 niguiri maçaricado + 5 uramaki camarão + 6 sashimi maçaricado + 5 joe maçaricado',
    63.00, v_grupos);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CEVICHE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Ceviche', 'Ceviche Completo',     'Salmão, camarão, polvo, agulhão, kani', 56.00);
SELECT _seed_top_oriental_insert('Ceviche', 'Ceviche Salmão Polvo Kani', 'Salmão, polvo, kani',              65.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- BEBIDAS — CERVEJAS
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Cervejas', 'Amstel',                       NULL,  6.00);
SELECT _seed_top_oriental_insert('Cervejas', 'Itaipava Latão',               NULL,  6.00);
SELECT _seed_top_oriental_insert('Cervejas', 'Devassa Lata 350ml',           NULL,  6.00);
SELECT _seed_top_oriental_insert('Cervejas', 'Eisenbahn Lata 350ml',         NULL, 11.00);
SELECT _seed_top_oriental_insert('Cervejas', 'Heineken Long Neck 350ml',     NULL, 11.00);
SELECT _seed_top_oriental_insert('Cervejas', 'Stella Artois Long Neck 275ml',NULL, 10.00);
SELECT _seed_top_oriental_insert('Cervejas', 'Corona Long Neck 330ml',       NULL, 12.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- BEBIDAS — REFRIGERANTES E OUTROS
-- ─────────────────────────────────────────────────────────────────────────────
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Refrigerante Lata',     NULL,  7.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Refrigerante Latinha',  NULL,  5.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Refrigerante 1 Litro',  NULL, 10.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Água Sem Gás',          NULL,  4.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Água Com Gás',          NULL,  6.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'H2OH!',                 NULL,  8.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Suco Lata Del Valle',   NULL,  8.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Schweppes Citrus',      NULL,  7.00);
SELECT _seed_top_oriental_insert('Refrigerantes e Outros', 'Suco da Fruta 300ml',   NULL,  6.00);

-- ─────────────────────────────────────────────────────────────────────────────
-- Limpa função auxiliar (manter o schema limpo)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _seed_top_oriental_insert(TEXT,TEXT,TEXT,NUMERIC,JSONB);

-- ─────────────────────────────────────────────────────────────────────────────
-- Resumo
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'categorias' AS tipo, COUNT(*) AS total
  FROM categorias
 WHERE empresa_id = (SELECT id FROM empresas WHERE slug='top-cozinha-oriental')
   AND deleted_at IS NULL
UNION ALL
SELECT 'produtos', COUNT(*)
  FROM produtos
 WHERE empresa_id = (SELECT id FROM empresas WHERE slug='top-cozinha-oriental')
   AND deleted_at IS NULL;
