-- 047_normalize_jsonb_columns.sql
-- Garante que colunas que devem ser JSONB realmente são JSONB.
-- Migração 009 criou evolution_eventos como TEXT; bancos antigos podem ter
-- ficado nesse estado. Esse script é idempotente e converte se necessário.

DO $$
DECLARE
  col_type text;
BEGIN
  -- evolution_eventos: TEXT → JSONB
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_name = 'empresas' AND column_name = 'evolution_eventos';
  IF col_type = 'text' THEN
    ALTER TABLE empresas
      ALTER COLUMN evolution_eventos
      TYPE JSONB
      USING CASE
        WHEN evolution_eventos IS NULL OR evolution_eventos = '' THEN '[]'::jsonb
        WHEN evolution_eventos LIKE '[%' THEN evolution_eventos::jsonb
        ELSE '[]'::jsonb
      END;
    ALTER TABLE empresas
      ALTER COLUMN evolution_eventos SET DEFAULT '[]'::jsonb;
    RAISE NOTICE 'evolution_eventos convertido TEXT → JSONB';
  END IF;

  -- n8n_eventos: idem
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_name = 'empresas' AND column_name = 'n8n_eventos';
  IF col_type = 'text' THEN
    ALTER TABLE empresas
      ALTER COLUMN n8n_eventos
      TYPE JSONB
      USING CASE
        WHEN n8n_eventos IS NULL OR n8n_eventos = '' THEN '[]'::jsonb
        WHEN n8n_eventos LIKE '[%' THEN n8n_eventos::jsonb
        ELSE '[]'::jsonb
      END;
    ALTER TABLE empresas
      ALTER COLUMN n8n_eventos SET DEFAULT '[]'::jsonb;
    RAISE NOTICE 'n8n_eventos convertido TEXT → JSONB';
  END IF;
END $$;
