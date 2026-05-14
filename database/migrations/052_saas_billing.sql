-- 052_saas_billing.sql
-- SaaS billing: master configura MP pra receber mensalidades + módulos.
-- Mensalidades por empresa + assinaturas recorrentes (PreApproval MP).

-- ─── 1. Singleton de config MP do master ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS saas_billing_config (
  id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Mercado Pago (cifrado AES-256-GCM)
  mp_access_token   TEXT,
  mp_public_key     TEXT,           -- pode ficar plaintext (é público mesmo)
  mp_webhook_secret TEXT,           -- segredo pra validar HMAC
  ativo             BOOLEAN NOT NULL DEFAULT FALSE,
  modo              TEXT NOT NULL DEFAULT 'sandbox' CHECK (modo IN ('sandbox', 'producao')),
  -- Defaults pras mensalidades
  vencimento_dia    INTEGER NOT NULL DEFAULT 10 CHECK (vencimento_dia BETWEEN 1 AND 28),
  juros_atraso_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  multa_atraso_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Telemetria
  ultimo_envio      TIMESTAMP,
  ultimo_status     TEXT,
  ultimo_erro       TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by        UUID
);

INSERT INTO saas_billing_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ─── 2. Mensalidades (1 por empresa+mês) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS mensalidades (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plano_id           UUID REFERENCES planos(id) ON DELETE SET NULL,
  mes_referencia     DATE NOT NULL,                -- 1º dia do mês
  valor              NUMERIC(10,2) NOT NULL,
  vencimento         DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'aberta'
                       CHECK (status IN ('aberta','paga','atrasada','cancelada','isenta')),
  -- Mercado Pago
  mp_preference_id   TEXT,                          -- preference Checkout Pro
  mp_payment_id      TEXT,                          -- após pagamento
  mp_init_point      TEXT,                          -- URL do checkout
  -- Pagamento
  pago_em            TIMESTAMP,
  pago_via           TEXT,                          -- pix, boleto, credito, dinheiro_manual
  comprovante_url    TEXT,
  observacoes        TEXT,
  -- Lembretes
  lembrete_d3_em     TIMESTAMP,
  lembrete_d1_em     TIMESTAMP,
  lembrete_atraso_em TIMESTAMP,
  -- Audit
  criado_em          TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em      TIMESTAMP NOT NULL DEFAULT NOW(),
  criado_por         UUID,                          -- usuario que gerou (cron usa null)

  UNIQUE (empresa_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_mensalidades_empresa_mes
  ON mensalidades(empresa_id, mes_referencia DESC);
CREATE INDEX IF NOT EXISTS idx_mensalidades_status
  ON mensalidades(status, vencimento);
CREATE INDEX IF NOT EXISTS idx_mensalidades_mp_payment
  ON mensalidades(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

-- ─── 3. Assinaturas (PreApproval MP — recorrente) ────────────────────────────

CREATE TABLE IF NOT EXISTS assinaturas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plano_id            UUID REFERENCES planos(id) ON DELETE SET NULL,
  mp_preapproval_id   TEXT,                         -- ID da assinatura MP
  mp_init_point       TEXT,                         -- URL pro cliente cadastrar cartão
  status              TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','autorizada','ativa','pausada','cancelada','rejeitada')),
  valor_mensal        NUMERIC(10,2) NOT NULL,
  proxima_cobranca    DATE,
  ultimo_pagamento_em TIMESTAMP,
  ativada_em          TIMESTAMP,
  cancelada_em        TIMESTAMP,
  cancelada_por       UUID,
  motivo_cancelamento TEXT,
  criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMP NOT NULL DEFAULT NOW(),

  -- 1 assinatura ativa por empresa
  CONSTRAINT uniq_assinatura_ativa
    EXCLUDE USING btree (empresa_id WITH =)
    WHERE (status IN ('pendente','autorizada','ativa'))
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_empresa
  ON assinaturas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_preapproval
  ON assinaturas(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

-- ─── 4. Template de e-mail "fatura_mensal" ──────────────────────────────────

INSERT INTO email_templates (evento, assunto, html, texto, descricao, variaveis)
VALUES (
  'fatura_mensal',
  'Sua fatura {{saas_nome}} · venc. {{vencimento}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#10b981;padding:24px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:40px;max-width:200px;margin-bottom:6px;">{{/saas_logo}}
      <h1 style="color:#fff;font-size:20px;margin:0;">Fatura mensal</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p>Olá <strong>{{empresa_nome}}</strong>,</p>
      <p>Sua mensalidade do <strong>{{saas_nome}}</strong> está disponível pra pagamento:</p>
      <table cellpadding="10" cellspacing="0" style="width:100%;background:#f8f9fa;border-radius:8px;margin:16px 0;">
        <tr><td style="color:#666;width:40%;">Plano:</td><td><strong>{{plano_nome}}</strong></td></tr>
        <tr><td style="color:#666;">Mês de referência:</td><td><strong>{{mes_referencia}}</strong></td></tr>
        <tr><td style="color:#666;">Valor:</td><td><strong style="color:#10b981;font-size:20px;">R$ {{valor}}</strong></td></tr>
        <tr><td style="color:#666;">Vencimento:</td><td><strong>{{vencimento}}</strong></td></tr>
      </table>
      <p style="text-align:center;margin:28px 0;">
        <a href="{{link_pagamento}}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Pagar agora</a>
      </p>
      <p style="font-size:13px;color:#666;text-align:center;">
        Aceitamos PIX, boleto e cartão. Pagamento processado pelo Mercado Pago.
      </p>
      {{#assinatura_url}}<p style="font-size:13px;color:#666;text-align:center;background:#fef9e7;padding:12px;border-radius:8px;border:1px solid #fbbf24;">
        💡 <strong>Quer pagar automaticamente todo mês?</strong><br>
        <a href="{{assinatura_url}}" style="color:#10b981;">Ative a assinatura recorrente</a> — cartão tokenizado seguro pelo MP.
      </p>{{/assinatura_url}}
      <p style="font-size:12px;color:#888;margin-top:24px;">
        Em caso de dúvidas, responda este e-mail ou entre em contato pelo {{saas_whatsapp}}.<br>
        {{razao_social}}{{#cnpj}} · CNPJ {{cnpj}}{{/cnpj}}
      </p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}}
    </td></tr>
  </table></body></html>',
  'Fatura {{saas_nome}}: R$ {{valor}} venc. {{vencimento}} ({{plano_nome}}). Pague em: {{link_pagamento}}',
  'Fatura mensal enviada pra empresa pagar mensalidade do plano',
  '["empresa_nome","plano_nome","mes_referencia","valor","vencimento","link_pagamento","assinatura_url","saas_nome","saas_logo","saas_whatsapp","razao_social","cnpj","ano"]'::jsonb
)
ON CONFLICT (evento) DO NOTHING;
