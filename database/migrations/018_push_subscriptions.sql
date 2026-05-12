-- Migration 018 — Web Push subscriptions (VAPID)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  endpoint    TEXT         NOT NULL,
  p256dh      TEXT         NOT NULL,
  auth        TEXT         NOT NULL,

  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Endpoint é único por usuário (mesmo dispositivo = mesma assinatura)
  CONSTRAINT push_subs_endpoint_unique UNIQUE (usuario_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_empresa ON push_subscriptions (empresa_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_usuario ON push_subscriptions (usuario_id);
