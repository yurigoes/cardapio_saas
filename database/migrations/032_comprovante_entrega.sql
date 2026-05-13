-- ─────────────────────────────────────────────────────────────────────────────
-- 032 — Comprovante de entrega (foto + nome de quem recebeu)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS entregue_foto_url     TEXT,
  ADD COLUMN IF NOT EXISTS entregue_recebido_por VARCHAR(255),
  ADD COLUMN IF NOT EXISTS entregue_observacoes  TEXT;
