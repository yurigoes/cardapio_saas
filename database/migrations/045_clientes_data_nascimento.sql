-- Garante coluna data_nascimento em clientes (idempotente).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_nascimento DATE;

CREATE INDEX IF NOT EXISTS idx_clientes_aniversario
  ON clientes (EXTRACT(MONTH FROM data_nascimento), EXTRACT(DAY FROM data_nascimento))
  WHERE data_nascimento IS NOT NULL AND deleted_at IS NULL;

-- Totem: aceita dinheiro? Default FALSE — só pix/cartão/pagar na entrega.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS totem_aceita_dinheiro BOOLEAN DEFAULT false;
