-- ─────────────────────────────────────────────────────────────────────────────
-- 035 — Personalização adicional do totem
-- ─────────────────────────────────────────────────────────────────────────────
-- Já existem: totem_bg_video_url, totem_bg_image_url, totem_cta_text, totem_slogan
-- Acrescenta:
--   - totem_logo_url        (logo dedicado, separado de empresas.logo_url)
--   - totem_cor_destaque    (override de cor_primaria só no totem)
--   - totem_promo_texto     (faixa promocional rolante na tela inicial)
--   - totem_pos_destaque    (top|bottom|center → onde exibir CTA)
--   - totem_atendimento     (msg curta, ex: "Sirva-se" / "Aguarde 2 min")
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS totem_logo_url     TEXT,
  ADD COLUMN IF NOT EXISTS totem_cor_destaque VARCHAR(20),
  ADD COLUMN IF NOT EXISTS totem_promo_texto  TEXT,
  ADD COLUMN IF NOT EXISTS totem_pos_destaque VARCHAR(10) DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS totem_atendimento  VARCHAR(100);
