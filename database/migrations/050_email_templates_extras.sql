-- 050_email_templates_extras.sql
-- Templates HTML adicionais pra eventos transacionais.
-- Idempotente via ON CONFLICT.

INSERT INTO email_templates (evento, assunto, html, texto, descricao, variaveis)
VALUES
-- ─── Pagamento confirmado (fatura) ─────────────────────────────────────────
(
  'pagamento_ok',
  'Pagamento confirmado · {{saas_nome}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#10b981;padding:24px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:40px;max-width:180px;margin-bottom:6px;">{{/saas_logo}}
      <h1 style="color:#fff;font-size:20px;margin:0;">✓ Pagamento confirmado</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p>Olá <strong>{{empresa_nome}}</strong>,</p>
      <p>Seu pagamento foi recebido com sucesso. Obrigado!</p>
      <table cellpadding="8" cellspacing="0" style="width:100%;background:#f8f9fa;border-radius:8px;margin:16px 0;">
        <tr><td style="color:#666;">Descrição:</td><td><strong>{{descricao}}</strong></td></tr>
        <tr><td style="color:#666;">Valor:</td><td><strong style="color:#10b981;">R$ {{valor}}</strong></td></tr>
        <tr><td style="color:#666;">Data:</td><td>{{data_pagamento}}</td></tr>
        <tr><td style="color:#666;">ID transação:</td><td><code style="font-size:11px;color:#888;">{{transacao_id}}</code></td></tr>
      </table>
      {{#painel_url}}<p style="text-align:center;margin:24px 0;">
        <a href="{{painel_url}}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar painel</a>
      </p>{{/painel_url}}
      <p style="font-size:13px;color:#666;">Este e-mail serve como recibo. Guarde para sua contabilidade.</p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}}
    </td></tr>
  </table></body></html>',
  '✓ Pagamento confirmado no {{saas_nome}}. Valor R$ {{valor}} · {{data_pagamento}} · Transação {{transacao_id}}',
  'Recibo enviado quando pagamento de plano/módulo é confirmado',
  '["empresa_nome","descricao","valor","data_pagamento","transacao_id","painel_url","saas_nome","saas_logo","ano"]'::jsonb
),
-- ─── Pagamento falhou ──────────────────────────────────────────────────────
(
  'pagamento_falhou',
  'Falha no pagamento · {{saas_nome}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#ef4444;padding:24px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:40px;max-width:180px;margin-bottom:6px;">{{/saas_logo}}
      <h1 style="color:#fff;font-size:20px;margin:0;">⚠ Falha no pagamento</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p>Olá <strong>{{empresa_nome}}</strong>,</p>
      <p>Não conseguimos processar seu pagamento de <strong>R$ {{valor}}</strong> ({{descricao}}).</p>
      {{#motivo}}<p style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px;border-radius:6px;font-size:13px;">
        <strong>Motivo:</strong> {{motivo}}
      </p>{{/motivo}}
      <p>Para evitar interrupção do serviço, atualize sua forma de pagamento:</p>
      {{#painel_url}}<p style="text-align:center;margin:24px 0;">
        <a href="{{painel_url}}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Atualizar pagamento</a>
      </p>{{/painel_url}}
      <p style="font-size:13px;color:#666;">Tentaremos cobrar novamente automaticamente nos próximos dias. Caso continue falhando, sua conta pode ser suspensa.</p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}}
    </td></tr>
  </table></body></html>',
  'Falha no pagamento ({{descricao}}, R$ {{valor}}). Motivo: {{motivo}}. Atualize em {{painel_url}}',
  'Aviso enviado quando pagamento de plano/módulo falha',
  '["empresa_nome","descricao","valor","motivo","painel_url","saas_nome","saas_logo","ano"]'::jsonb
),
-- ─── Trial expirando ───────────────────────────────────────────────────────
(
  'trial_expirando',
  'Seu teste grátis expira em {{dias_restantes}} dia(s) · {{saas_nome}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#f59e0b;padding:24px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:40px;max-width:180px;margin-bottom:6px;">{{/saas_logo}}
      <h1 style="color:#fff;font-size:20px;margin:0;">⏰ Teste grátis expirando</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p>Olá <strong>{{empresa_nome}}</strong>,</p>
      <p>Seu período de teste no <strong>{{saas_nome}}</strong> termina em <strong style="color:#f59e0b;">{{dias_restantes}} dia(s)</strong> ({{data_expira}}).</p>
      <p>Pra continuar usando o sistema sem interrupção, ative sua assinatura:</p>
      {{#planos_url}}<p style="text-align:center;margin:24px 0;">
        <a href="{{planos_url}}" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver planos</a>
      </p>{{/planos_url}}
      <p style="font-size:13px;color:#666;">Após o trial, sua conta entra em modo somente-leitura. Os dados ficam preservados por 30 dias antes de exclusão definitiva.</p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}}
    </td></tr>
  </table></body></html>',
  'Seu teste no {{saas_nome}} expira em {{dias_restantes}} dia(s) ({{data_expira}}). Ativar plano: {{planos_url}}',
  'Aviso enviado 3 dias e 1 dia antes do trial expirar',
  '["empresa_nome","dias_restantes","data_expira","planos_url","saas_nome","saas_logo","ano"]'::jsonb
),
-- ─── Manutenção programada ─────────────────────────────────────────────────
(
  'manutencao_aviso',
  'Manutenção programada · {{saas_nome}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1f2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <tr><td style="background:#3b82f6;padding:24px 32px;text-align:center;">
      {{#saas_logo}}<img src="{{saas_logo}}" alt="{{saas_nome}}" style="max-height:40px;max-width:180px;margin-bottom:6px;">{{/saas_logo}}
      <h1 style="color:#fff;font-size:20px;margin:0;">🔧 Manutenção programada</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p>Olá <strong>{{empresa_nome}}</strong>,</p>
      <p>Vamos realizar uma manutenção no {{saas_nome}}:</p>
      <table cellpadding="8" cellspacing="0" style="width:100%;background:#f8f9fa;border-radius:8px;margin:16px 0;">
        <tr><td style="color:#666;width:40%;">Início:</td><td><strong>{{inicio}}</strong></td></tr>
        <tr><td style="color:#666;">Duração estimada:</td><td><strong>{{duracao}}</strong></td></tr>
        <tr><td style="color:#666;">Impacto:</td><td>{{impacto}}</td></tr>
      </table>
      {{#detalhes}}<p style="font-size:14px;">{{detalhes}}</p>{{/detalhes}}
      <p style="font-size:13px;color:#666;">Pedidos em andamento serão preservados. O painel pode ficar indisponível durante a janela.</p>
    </td></tr>
    <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;font-size:12px;color:#888;">
      © {{ano}} {{saas_nome}}
    </td></tr>
  </table></body></html>',
  'Manutenção programada no {{saas_nome}}. Início: {{inicio}}. Duração: {{duracao}}. Impacto: {{impacto}}',
  'Aviso de manutenção enviado pra todas as empresas com antecedência',
  '["empresa_nome","inicio","duracao","impacto","detalhes","saas_nome","saas_logo","ano"]'::jsonb
)
ON CONFLICT (evento) DO NOTHING;
