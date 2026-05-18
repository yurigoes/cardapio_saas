-- 075_painel_cliente.sql
-- Login do cliente final via OTP (WhatsApp ou SMS).
-- Cliente entra com telefone/CPF, recebe código de 6 dígitos, valida e ganha sessão.

CREATE TABLE IF NOT EXISTS cliente_otp (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  identificador TEXT NOT NULL,                 -- telefone (E164) ou CPF normalizado
  tipo_id       TEXT NOT NULL CHECK (tipo_id IN ('telefone','cpf','email')),
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  codigo_hash   TEXT NOT NULL,                 -- sha256 do código
  expira_em     TIMESTAMPTZ NOT NULL,
  tentativas    INT NOT NULL DEFAULT 0,
  validado      BOOLEAN NOT NULL DEFAULT FALSE,
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cliente_otp_empresa ON cliente_otp(empresa_id, identificador, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_otp_expira  ON cliente_otp(expira_em);

CREATE TABLE IF NOT EXISTS cliente_sessoes (
  token         TEXT PRIMARY KEY,              -- token opaco (JWT-like ou random 32 bytes)
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  expira_em     TIMESTAMPTZ NOT NULL,
  ip            INET,
  user_agent    TEXT,
  ultima_uso    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cliente_sess_expira ON cliente_sessoes(expira_em);
CREATE INDEX IF NOT EXISTS idx_cliente_sess_cli    ON cliente_sessoes(cliente_id);
