-- 053_ifood_distribuido.sql
-- Suporte ao app DISTRIBUÍDO do iFood:
--   - Master configura UMA app no iFood Developer (tipo "Distribuído")
--   - Cada empresa cliente faz fluxo userCode pra autorizar SUA loja
--   - Cada empresa fica com refresh_token próprio
--   - Master credentials ficam em saas_ifood_config (singleton)
--   - Empresa credentials/tokens em ifood_config (já existe)

-- ─── 1. Master singleton — credenciais da app Distribuída ─────────────────────

CREATE TABLE IF NOT EXISTS saas_ifood_config (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Credenciais da app Distribuída do master (cifradas AES-256-GCM)
  client_id       TEXT,                          -- formato 'encrypted:...' opcional
  client_secret   TEXT,                          -- formato 'encrypted:...'
  app_nome        TEXT,                          -- apelido do app (pra UI)
  ativo           BOOLEAN NOT NULL DEFAULT FALSE,
  -- Telemetria
  ultimo_userCode_em TIMESTAMP,
  ultimo_erro     TEXT,
  ultimo_erro_em  TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

INSERT INTO saas_ifood_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── 2. Per-empresa: adiciona modo + refresh_token ───────────────────────────

ALTER TABLE ifood_config
  ADD COLUMN IF NOT EXISTS mode                       TEXT NOT NULL DEFAULT 'centralizado'
                            CHECK (mode IN ('centralizado','distribuido')),
  ADD COLUMN IF NOT EXISTS refresh_token              TEXT,    -- cifrado
  ADD COLUMN IF NOT EXISTS authorization_code_verifier TEXT,   -- temp durante userCode flow
  ADD COLUMN IF NOT EXISTS userCode_em                TIMESTAMP, -- quando começou o flow
  ADD COLUMN IF NOT EXISTS authorized_em              TIMESTAMP, -- quando completou
  ADD COLUMN IF NOT EXISTS authorized_por             UUID;      -- usuário que autorizou
