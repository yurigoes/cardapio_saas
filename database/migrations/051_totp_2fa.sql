-- 051_totp_2fa.sql
-- 2FA TOTP (RFC 6238) — opcional pra qualquer usuário, recomendado pra master.
--
-- Fluxo:
--   1. Setup: GET /api/auth/2fa/setup gera secret + QR code (não persiste ainda)
--   2. Confirma: POST /api/auth/2fa/verify com código TOTP grava secret no DB
--   3. Login: se totp_enabled, exige 2fa_code OU recovery_code adicional
--   4. Recovery: 8 códigos one-shot (hash bcrypt) gerados na ativação
--   5. Disable: requer 2fa_code OU senha + invalida todas as sessões

-- Adiciona colunas no usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS totp_secret      TEXT,                       -- cifrado AES-256-GCM
  ADD COLUMN IF NOT EXISTS totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_enabled_em  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS totp_ultimo_uso  TIMESTAMP;

-- Tabela de recovery codes (8 por usuário, hash bcrypt, one-shot)
CREATE TABLE IF NOT EXISTS totp_recovery_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash   TEXT NOT NULL,
  usado_em      TIMESTAMP,
  ip_uso        TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_totp_recovery_usuario
  ON totp_recovery_codes(usuario_id, usado_em);
