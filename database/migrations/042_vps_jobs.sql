-- Fila de comandos pro vps-agent processar
CREATE TABLE IF NOT EXISTS vps_jobs (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  comando      VARCHAR(50)  NOT NULL,
  params       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(20)  NOT NULL DEFAULT 'pendente',
  resultado    JSONB,
  erro         TEXT,
  duracao_ms   INTEGER,
  criado_por   UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  enviado_em   TIMESTAMPTZ,
  expira_em    TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_vps_jobs_pendentes ON vps_jobs (status, created_at) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_vps_jobs_recent    ON vps_jobs (created_at DESC);
