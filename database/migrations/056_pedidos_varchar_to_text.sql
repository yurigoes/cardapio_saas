-- 056_pedidos_varchar_to_text.sql
-- Converte TODAS as colunas character varying de pedidos para TEXT.
-- Motivo: importer iFood continua falhando com 'value too long for
-- type character varying(20)' mesmo após a 055. Alguma outra coluna
-- (provavelmente status, tipo, tipo_consumo, origem ou similar) tem
-- limite varchar(20) que orderId UUID iFood (36 chars) ou strings
-- longas estouram.
--
-- TEXT no Postgres não tem custo extra vs varchar — limite arbitrário
-- só atrapalha. Esta migration é defensiva e idempotente.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT column_name, character_maximum_length
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'pedidos'
       AND data_type    = 'character varying'
  LOOP
    EXECUTE format('ALTER TABLE pedidos ALTER COLUMN %I TYPE TEXT', r.column_name);
    RAISE NOTICE 'pedidos.% varchar(%) → TEXT',
                 r.column_name, COALESCE(r.character_maximum_length::text, 'unlim');
  END LOOP;
END $$;

-- Mesmo tratamento defensivo pra ifood_eventos
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT column_name, character_maximum_length
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'ifood_eventos'
       AND data_type    = 'character varying'
  LOOP
    EXECUTE format('ALTER TABLE ifood_eventos ALTER COLUMN %I TYPE TEXT', r.column_name);
    RAISE NOTICE 'ifood_eventos.% varchar(%) → TEXT',
                 r.column_name, COALESCE(r.character_maximum_length::text, 'unlim');
  END LOOP;
END $$;
