-- Migration 012 — Variações de produto (tamanho, sabor, adicionais)

-- Coluna JSONB para armazenar grupos de variações por produto
-- Schema esperado:
--   {
--     "grupos": [
--       {
--         "id":         "tamanho",
--         "nome":       "Tamanho",
--         "tipo":       "single",     -- single | multiple
--         "obrigatorio": true,
--         "min":        1,            -- mínimo de opções a escolher
--         "max":        1,            -- máximo de opções a escolher
--         "opcoes": [
--           { "id": "p", "nome": "Pequeno", "preco_extra": 0 },
--           { "id": "m", "nome": "Médio",   "preco_extra": 5 },
--           { "id": "g", "nome": "Grande",  "preco_extra": 10 }
--         ]
--       },
--       {
--         "id":         "adicionais",
--         "nome":       "Adicionais",
--         "tipo":       "multiple",
--         "obrigatorio": false,
--         "min":        0,
--         "max":        5,
--         "opcoes": [
--           { "id": "bacon",  "nome": "Bacon extra",  "preco_extra": 4 },
--           { "id": "queijo", "nome": "Queijo extra", "preco_extra": 3 }
--         ]
--       }
--     ]
--   }

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS variacoes JSONB NOT NULL DEFAULT '{"grupos":[]}'::jsonb;

-- Índice GIN para queries futuras que filtrem por opções
CREATE INDEX IF NOT EXISTS idx_produtos_variacoes ON produtos USING GIN (variacoes);

-- pedido_itens.adicionais já existe (JSONB) — vamos usar para guardar a seleção:
--   [
--     { "grupo_id": "tamanho", "grupo_nome": "Tamanho",
--       "opcao_id": "g", "opcao_nome": "Grande", "preco_extra": 10 },
--     { "grupo_id": "adicionais", "grupo_nome": "Adicionais",
--       "opcao_id": "bacon", "opcao_nome": "Bacon extra", "preco_extra": 4 }
--   ]
