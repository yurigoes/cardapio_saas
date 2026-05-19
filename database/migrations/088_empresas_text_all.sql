-- 088_empresas_text_all.sql
-- Converte TODAS as colunas character varying da tabela empresas pra TEXT.
-- Mais simples e à prova de futuro — em PG, TEXT e VARCHAR usam o mesmo
-- tipo interno, só muda o constraint de comprimento.
--
-- Roda dinamicamente via DO block — pega todas as colunas varchar e converte.

DO $$
DECLARE
  col RECORD;
  sql_cmd TEXT;
BEGIN
  FOR col IN
    SELECT column_name, character_maximum_length
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'empresas'
       AND data_type    = 'character varying'
       -- Preservar campos que SÃO realmente curtos por design (UF, etc)
       AND column_name NOT IN ('endereco_uf')
  LOOP
    sql_cmd := format('ALTER TABLE empresas ALTER COLUMN %I TYPE TEXT', col.column_name);
    RAISE NOTICE 'Convertendo %.% (era varchar(%)) → TEXT',
                 'empresas', col.column_name, col.character_maximum_length;
    EXECUTE sql_cmd;
  END LOOP;
END $$;

-- endereco_uf fica VARCHAR(10) — UF brasileira tem 2 chars mas alguns
-- sistemas usam formato 'UF-Y' ou códigos internos
ALTER TABLE empresas ALTER COLUMN endereco_uf TYPE VARCHAR(10);
