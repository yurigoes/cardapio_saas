-- 065_suporte_avancado.sql
-- 1) Operador (master/suporte) com identidade própria pra envio de email
-- 2) Validação 2FA WhatsApp (admin + usuário) → selos no chamado
-- 3) Log de emails enviados pelo suporte

-- ─── 1. Identidade do operador ────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_from       TEXT,           -- ex: joao@three.com.br
  ADD COLUMN IF NOT EXISTS cargo            TEXT,           -- ex: "Suporte Técnico"
  ADD COLUMN IF NOT EXISTS assinatura_html  TEXT,           -- HTML da assinatura
  ADD COLUMN IF NOT EXISTS telefone         TEXT;           -- pra reset/2fa próprio

COMMENT ON COLUMN usuarios.email_from IS
  'Endereço usado como remetente quando este usuário envia emails. Requer SMTP autorizado a enviar como esse domínio (SPF/DKIM).';
COMMENT ON COLUMN usuarios.assinatura_html IS
  'HTML que aparece no rodapé dos emails enviados por este usuário.';

-- ─── 2. Validações 2FA WhatsApp ───────────────────────────────
CREATE TABLE IF NOT EXISTS suporte_validacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id      UUID NOT NULL REFERENCES suporte_chamados(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('admin','usuario')),
  codigo_hash     TEXT NOT NULL,             -- sha256 do código (não armazena cleartext)
  telefone        TEXT NOT NULL,             -- pra onde foi enviado
  solicitado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  solicitado_em   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expira_em       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  validado_em     TIMESTAMP WITH TIME ZONE,
  validado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  cancelado_em    TIMESTAMP WITH TIME ZONE,
  tentativas      INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_validacoes_chamado
  ON suporte_validacoes(chamado_id, tipo) WHERE cancelado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_validacoes_pendentes
  ON suporte_validacoes(chamado_id) WHERE validado_em IS NULL AND cancelado_em IS NULL;

-- Selos calculados em runtime via VIEW (não denormaliza no chamado)
CREATE OR REPLACE VIEW v_chamado_selos AS
  SELECT
    c.id AS chamado_id,
    EXISTS (SELECT 1 FROM suporte_validacoes v
             WHERE v.chamado_id = c.id AND v.tipo = 'admin'
               AND v.validado_em IS NOT NULL AND v.cancelado_em IS NULL) AS admin_validado,
    EXISTS (SELECT 1 FROM suporte_validacoes v
             WHERE v.chamado_id = c.id AND v.tipo = 'usuario'
               AND v.validado_em IS NOT NULL AND v.cancelado_em IS NULL) AS usuario_validado
  FROM suporte_chamados c;

-- ─── 3. Log de emails enviados ────────────────────────────────
CREATE TABLE IF NOT EXISTS suporte_emails_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id      UUID REFERENCES suporte_chamados(id) ON DELETE SET NULL,
  enviado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_de      TEXT NOT NULL,         -- email_from do remetente
  para            TEXT NOT NULL,
  assunto         TEXT NOT NULL,
  html            TEXT NOT NULL,
  enviado_em      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  erro            TEXT
);

CREATE INDEX IF NOT EXISTS idx_emails_log_chamado ON suporte_emails_log(chamado_id, enviado_em DESC);
