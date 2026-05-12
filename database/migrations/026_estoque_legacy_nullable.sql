-- ─────────────────────────────────────────────────────────────────────────────
-- 026 — estoque_movimentos: torna colunas legadas NOT NULL → nullable
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesmo padrão da migration 024 para caixas: o app insere apenas as colunas
-- novas (estoque_anterior/estoque_atual), e colunas legadas como
-- 'quantidade_anterior' (NOT NULL) bloqueavam o INSERT.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  col_name TEXT;
BEGIN
  FOR col_name IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'estoque_movimentos'
      AND is_nullable = 'NO'
      AND column_name NOT IN (
        -- Mantém NOT NULL nas colunas que o app/migration 017 exige
        'id', 'empresa_id', 'produto_id', 'tipo', 'quantidade', 'criado_em'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE estoque_movimentos ALTER COLUMN %I DROP NOT NULL', col_name);
      RAISE NOTICE 'estoque_movimentos.% agora nullable', col_name;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Falha ao tornar estoque_movimentos.% nullable: %', col_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- Mesma profilaxia para caixa_movimentos (caso tenha resíduos legados)
DO $$
DECLARE
  col_name TEXT;
BEGIN
  FOR col_name IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'caixa_movimentos'
      AND is_nullable = 'NO'
      AND column_name NOT IN (
        'id', 'caixa_id', 'empresa_id', 'tipo', 'valor', 'criado_em'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE caixa_movimentos ALTER COLUMN %I DROP NOT NULL', col_name);
      RAISE NOTICE 'caixa_movimentos.% agora nullable', col_name;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Falha: %', SQLERRM;
    END;
  END LOOP;
END $$;

-- E em pagamentos
DO $$
DECLARE
  col_name TEXT;
BEGIN
  FOR col_name IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'pagamentos'
      AND is_nullable = 'NO'
      AND column_name NOT IN (
        'id', 'empresa_id', 'gateway_slug', 'gateway_id', 'metodo', 'status', 'valor'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE pagamentos ALTER COLUMN %I DROP NOT NULL', col_name);
      RAISE NOTICE 'pagamentos.% agora nullable', col_name;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Falha: %', SQLERRM;
    END;
  END LOOP;
END $$;
