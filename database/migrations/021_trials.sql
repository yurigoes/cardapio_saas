-- ─────────────────────────────────────────────────────────────────────────────
-- 021 — Trials automáticos
-- ─────────────────────────────────────────────────────────────────────────────
-- Toda empresa nova nasce com trial de 14 dias.
-- Quando expira, cron diário marca status = 'suspensa' (módulos pagos param).
-- Master pode estender via POST /api/admin/empresas/:id/extend-trial.
--
-- Status do ciclo de vida:
--   teste     → empresa em trial
--   ativo     → trial convertido em assinatura paga
--   suspensa  → trial expirou OU pagamento atrasou
--   cancelada → desistiu / encerrou
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS trial_inicio TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_fim    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_dias   INTEGER DEFAULT 14;

-- Índice para o cron scan diário
CREATE INDEX IF NOT EXISTS idx_empresas_trial_fim
  ON empresas (trial_fim)
  WHERE deleted_at IS NULL AND status = 'teste';

-- Backfill: empresas existentes com status='teste' e sem trial → 14 dias a partir de created_at
UPDATE empresas
   SET trial_inicio = created_at,
       trial_fim    = created_at + INTERVAL '14 days'
 WHERE status = 'teste'
   AND trial_fim IS NULL
   AND deleted_at IS NULL;

-- Empresas que já estão 'ativo' não recebem trial (já pagam)
-- Empresas 'suspensa' / 'cancelada' também ficam de fora
