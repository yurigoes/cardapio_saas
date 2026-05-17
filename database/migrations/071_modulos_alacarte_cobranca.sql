-- 071_modulos_alacarte_cobranca.sql
-- Pago/cobrança de módulos extras à la carte + relacionamento com mensalidades.

ALTER TABLE empresa_modulos_extras
  ADD COLUMN IF NOT EXISTS pago               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pago_em            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pago_via           TEXT,
  ADD COLUMN IF NOT EXISTS pago_por_usuario_id UUID REFERENCES usuarios(id);

-- Índice pra cron rodar rápido
CREATE INDEX IF NOT EXISTS idx_emex_bloqueio_pendente
  ON empresa_modulos_extras (tipo, expira_em, bloqueado, pago)
  WHERE tipo = 'alacarte' AND bloqueado = FALSE AND pago = FALSE;
