-- 067_suporte_templates.sql
-- Templates configuráveis pra emails e mensagens WhatsApp do suporte.
-- Tudo em suporte_horarios (singleton id=1) pra concentrar config.

ALTER TABLE suporte_horarios
  ADD COLUMN IF NOT EXISTS email_subject_resposta   TEXT DEFAULT 'Resposta no seu chamado: {assunto}',
  ADD COLUMN IF NOT EXISTS email_html_resposta      TEXT DEFAULT
    '<p>Olá {cliente}!</p><p>Nossa equipe respondeu ao seu chamado <strong>{assunto}</strong>:</p><blockquote>{mensagem}</blockquote><p><a href="{link}">Ver e responder</a></p>',

  ADD COLUMN IF NOT EXISTS email_subject_chamado_novo TEXT DEFAULT '[Suporte] {empresa}: {assunto}',
  ADD COLUMN IF NOT EXISTS email_html_chamado_novo    TEXT DEFAULT
    '<p><strong>{empresa}</strong> abriu novo chamado:</p><blockquote>{mensagem}</blockquote><p>Prioridade: {prioridade}</p><p><a href="{link}">Ver chamado</a></p>',

  ADD COLUMN IF NOT EXISTS whatsapp_resposta_cliente TEXT DEFAULT
    '🎯 *Three Digital — Suporte*\n\n{operador} respondeu seu chamado *{assunto}*:\n\n{mensagem}\n\nResponda em: {link}',

  ADD COLUMN IF NOT EXISTS whatsapp_validacao_admin TEXT DEFAULT
    '🔐 *Three Digital — Validação Admin*\n\nCódigo de autorização para {usuario_nome}:\n\n*{codigo}*\n\nVálido por 30 minutos. Se não foi você, ignore.',

  ADD COLUMN IF NOT EXISTS whatsapp_validacao_usuario TEXT DEFAULT
    '🔐 *Three Digital — Validação*\n\nCódigo pra confirmar que você abriu o chamado:\n\n*{codigo}*\n\nVálido por 30 minutos.';

COMMENT ON COLUMN suporte_horarios.whatsapp_resposta_cliente IS
  'Template enviado quando agente clica "Disparar WhatsApp" no chat. Variáveis: {operador} {assunto} {mensagem} {link} {cliente} {empresa}';
