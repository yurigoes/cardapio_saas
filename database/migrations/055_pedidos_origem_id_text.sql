-- 055_pedidos_origem_id_text.sql
-- Aumenta pedidos.origem_id de varchar(20) para TEXT.
-- Motivo: orderId do iFood é UUID (36 chars), não cabe em varchar(20).
-- Antes só pedidos simulados (prefixo SIM-, ~19 chars) cabiam; pedidos
-- reais quebravam com 'value too long for type character varying(20)'.

ALTER TABLE pedidos
  ALTER COLUMN origem_id TYPE TEXT;

-- Garante que outras colunas de id externas também são TEXT (defensivo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pedidos' AND column_name='ifood_order_id'
       AND data_type='character varying'
  ) THEN
    ALTER TABLE pedidos ALTER COLUMN ifood_order_id TYPE TEXT;
  END IF;
END $$;
