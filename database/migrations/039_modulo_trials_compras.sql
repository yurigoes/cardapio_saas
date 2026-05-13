-- ═══════════════════════════════════════════════════════════════
--  Migration 039 — Trials e compras de módulos à la carte
--
--  Sistema:
--    1. Empresa tem `modulos_ativos` (JSONB) — incluídos no plano
--    2. Pode adicionar trial de 7 dias por módulo (1x por módulo)
--    3. Pode comprar mensalmente módulos extras (à la carte)
--
--  Helper SQL pra UI:
--    SELECT modulo FROM modulo_trials
--     WHERE empresa_id = $1 AND expira_em > NOW();
-- ═══════════════════════════════════════════════════════════════

-- ── Trials de 7 dias ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulo_trials (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modulo      VARCHAR(50)  NOT NULL,
  iniciado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expira_em   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  criado_por  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Não permite re-trial do mesmo módulo
  UNIQUE (empresa_id, modulo)
);

CREATE INDEX IF NOT EXISTS idx_modulo_trials_ativos
  ON modulo_trials (empresa_id, modulo)
  WHERE expira_em > NOW();

-- ── Compras à la carte ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulo_compras (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modulo      VARCHAR(50)  NOT NULL,
  valor       DECIMAL(10,2) NOT NULL,
  -- 'pendente' (intenção criada), 'pago' (gateway confirmou), 'cancelado', 'expirado'
  status      VARCHAR(20)  NOT NULL DEFAULT 'pendente',
  -- Quando o pagamento for confirmado, vira active até expira_em
  ativa_ate   TIMESTAMPTZ,
  -- referência externa (mp/stripe payment id)
  gateway_ref VARCHAR(255),
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  pago_em     TIMESTAMPTZ,
  criado_por  UUID         REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_modulo_compras_ativas
  ON modulo_compras (empresa_id, modulo)
  WHERE status = 'pago' AND (ativa_ate IS NULL OR ativa_ate > NOW());

CREATE INDEX IF NOT EXISTS idx_modulo_compras_pendentes
  ON modulo_compras (status, criado_em DESC);

-- ── View útil pra checar acesso a módulo ───────────────────────
-- Inclui: módulos do plano + trials ativos + compras pagas vigentes
CREATE OR REPLACE VIEW v_empresa_modulos_ativos AS
SELECT e.id AS empresa_id, jsonb_array_elements_text(e.modulos_ativos) AS modulo
  FROM empresas e
 WHERE e.deleted_at IS NULL
UNION
SELECT empresa_id, modulo FROM modulo_trials WHERE expira_em > NOW()
UNION
SELECT empresa_id, modulo FROM modulo_compras
 WHERE status = 'pago' AND (ativa_ate IS NULL OR ativa_ate > NOW());
