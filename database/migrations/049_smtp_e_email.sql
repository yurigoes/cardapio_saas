-- 049_smtp_e_email.sql
-- Sistema de e-mail transacional do master:
--   - smtp_config: credenciais do servidor SMTP (1 registro, master only)
--   - email_templates: templates HTML por evento (boas_vindas, reset_senha, etc)
--   - email_jobs: queue de envio com retry
--   - password_resets: tokens de recuperação de senha (e-mail OU whatsapp)

-- ─── 1. SMTP config (singleton) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS smtp_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  host        TEXT,
  port        INTEGER NOT NULL DEFAULT 587,
  secure      BOOLEAN NOT NULL DEFAULT FALSE,                 -- TLS implícito
  username    TEXT,
  password    TEXT,                                           -- criptografado idealmente
  from_name   TEXT,
  from_email  TEXT,
  reply_to    TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Telemetria
  ultimo_envio    TIMESTAMP,
  ultimo_status   TEXT,                                       -- ok | erro
  ultimo_erro     TEXT,
  enviados_total  INTEGER NOT NULL DEFAULT 0,
  falhas_total    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

INSERT INTO smtp_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── 2. Templates ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento      TEXT NOT NULL UNIQUE,            -- boas_vindas | reset_senha | fatura | ...
  assunto     TEXT NOT NULL,
  html        TEXT NOT NULL,                   -- HTML com {{variaveis}}
  texto       TEXT,                            -- fallback text/plain
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  descricao   TEXT,
  variaveis   JSONB DEFAULT '[]'::jsonb,       -- lista de chaves suportadas
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_email_templates_evento ON email_templates(evento);

-- ─── 3. Queue de envio ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  para            TEXT NOT NULL,
  cc              TEXT,
  bcc             TEXT,
  assunto         TEXT NOT NULL,
  html            TEXT NOT NULL,
  texto           TEXT,
  evento          TEXT,                        -- boas_vindas | reset_senha | manual | ...
  contexto        JSONB,                       -- dados que vão pra log/template ({empresa_id, usuario_id, etc})
  status          TEXT NOT NULL DEFAULT 'pendente',  -- pendente | enviando | enviado | erro
  tentativas      INTEGER NOT NULL DEFAULT 0,
  max_tentativas  INTEGER NOT NULL DEFAULT 3,
  proximo_em      TIMESTAMP,                   -- backoff exponencial
  enviado_em      TIMESTAMP,
  erro            TEXT,
  message_id      TEXT,                        -- ID retornado pelo SMTP server
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status_proximo
  ON email_jobs(status, proximo_em)
  WHERE status IN ('pendente', 'enviando');

CREATE INDEX IF NOT EXISTS idx_email_jobs_created  ON email_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_jobs_evento   ON email_jobs(evento);

-- ─── 4. Recuperação de senha (multi-canal) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_resets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo       TEXT NOT NULL,                  -- 6 dígitos hash bcrypt
  canal        TEXT NOT NULL,                  -- email | whatsapp
  destino      TEXT NOT NULL,                  -- email ou número usado
  expires_at   TIMESTAMP NOT NULL,
  usado_em     TIMESTAMP,
  ip_origem    TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_usuario ON password_resets(usuario_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);

-- ─── 5. Templates default (boas-vindas + reset senha) ─────────────────────────

INSERT INTO email_templates (evento, assunto, html, texto, descricao, variaveis)
VALUES
(
  'boas_vindas',
  'Bem-vindo(a) ao {{saas_nome}}!',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#10b981;padding:28px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:48px;max-width:200px;margin-bottom:8px;">{{/saas_logo}}
      <h1 style="color:#fff;font-size:22px;margin:0;">Bem-vindo(a)!</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p>Olá <strong>{{empresa_nome}}</strong>,</p>
      <p>Sua conta no <strong>{{saas_nome}}</strong> foi criada com sucesso!</p>
      <p>Você tem <strong>14 dias grátis</strong> pra testar todos os módulos do plano <strong>{{plano_nome}}</strong>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="{{painel_url}}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar painel</a>
      </p>
      <p style="font-size:14px;color:#555;">Próximos passos:</p>
      <ol style="font-size:14px;color:#555;line-height:1.7;">
        <li>Completar dados da empresa em <em>Configurações</em></li>
        <li>Cadastrar primeira categoria e produto em <em>Cardápio</em></li>
        <li>Conectar WhatsApp em <em>Integrações</em> (opcional)</li>
        <li>Configurar PIX ou gateway em <em>Gateways</em></li>
      </ol>
      <p>Qualquer dúvida, responda este e-mail ou entre em contato pelo {{saas_whatsapp}}.</p>
      <p>Boas vendas!<br>Equipe {{saas_nome}}</p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:16px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}} · <a href="{{saas_site}}" style="color:#10b981;">{{saas_site}}</a>
    </td></tr>
  </table></body></html>',
  'Bem-vindo(a) ao {{saas_nome}}! Sua conta foi criada. Acesse o painel: {{painel_url}}',
  'Enviado quando uma empresa nova se cadastra',
  '["empresa_nome","plano_nome","painel_url","saas_nome","saas_logo","saas_whatsapp","saas_site","ano"]'::jsonb
),
(
  'reset_senha',
  'Recuperação de senha · {{saas_nome}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#10b981;padding:24px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:40px;max-width:180px;">{{/saas_logo}}
    </td></tr>
    <tr><td style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:20px;">Recuperação de senha</h2>
      <p>Olá <strong>{{usuario_nome}}</strong>,</p>
      <p>Recebemos um pedido pra redefinir sua senha no {{saas_nome}}.</p>
      <p>Use o código abaixo para continuar (válido por 15 minutos):</p>
      <p style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;background:#f4f6f8;padding:16px 32px;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#10b981;font-family:monospace;">{{codigo}}</span>
      </p>
      <p style="font-size:13px;color:#888;">Se você não solicitou essa recuperação, ignore este e-mail. Sua senha continua a mesma.</p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:16px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}}
    </td></tr>
  </table></body></html>',
  'Seu código de recuperação no {{saas_nome}}: {{codigo}} (válido por 15 minutos). Se não foi você, ignore.',
  'Enviado quando usuário pede reset de senha',
  '["usuario_nome","codigo","saas_nome","saas_logo","ano"]'::jsonb
)
ON CONFLICT (evento) DO NOTHING;
