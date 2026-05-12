-- ─────────────────────────────────────────────────────────────────────────────
-- 024 — Segunda rodada de alinhamento de schema legado
-- ─────────────────────────────────────────────────────────────────────────────
-- Após 023 ainda apareceram dois bugs:
--   1) caixas.usuario_id (legado) era NOT NULL — mas o app insere em
--      usuario_abertura_id agora. Não-null impede INSERTs.
--   2) clientes.ultimo_pedido_em não existe — o app tenta UPDATE.
--
-- Tudo idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── caixas: torna coluna legada usuario_id nullable (se existir) ─────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caixas' AND column_name = 'usuario_id'
  ) THEN
    BEGIN
      ALTER TABLE caixas ALTER COLUMN usuario_id DROP NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Não foi possível tornar caixas.usuario_id nullable: %', SQLERRM;
    END;
  END IF;
END $$;

-- Idem para qualquer outra coluna NOT NULL legada que esteja bloqueando
DO $$
DECLARE
  col_name TEXT;
BEGIN
  FOR col_name IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'caixas'
      AND is_nullable = 'NO'
      AND column_name NOT IN (
        -- Mantém NOT NULL nas colunas que o app/schema atual exige
        'id', 'empresa_id', 'usuario_abertura_id',
        'valor_abertura', 'status', 'aberto_em', 'created_at', 'updated_at'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE caixas ALTER COLUMN %I DROP NOT NULL', col_name);
      RAISE NOTICE 'caixas.% agora nullable', col_name;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Falha ao tornar caixas.% nullable: %', col_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── clientes: colunas que o app usa mas faltam no legado ─────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ultimo_pedido_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_pedidos      INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gasto        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pontos             INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_cashback     NUMERIC(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clientes_ultimo_pedido
  ON clientes (empresa_id, ultimo_pedido_em DESC NULLS LAST);
