-- 068_anexos_templates.sql
-- Anexos em mensagens + biblioteca de templates de email/WhatsApp

-- ─── 1. Anexos em mensagens ────────────────────────────────────
-- A coluna 'anexos' JSONB já existe em suporte_mensagens (migration 064).
-- Mas faltava endpoint dedicado de upload. Aqui só validação adicional.

CREATE TABLE IF NOT EXISTS suporte_anexos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id     UUID REFERENCES suporte_mensagens(id) ON DELETE CASCADE,
  chamado_id      UUID NOT NULL REFERENCES suporte_chamados(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,             -- URL pública (MinIO + /s3/)
  nome_original   TEXT NOT NULL,
  mime            TEXT NOT NULL,
  tamanho_bytes   INT NOT NULL,
  uploaded_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  uploaded_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anexos_chamado ON suporte_anexos(chamado_id, uploaded_em DESC);
CREATE INDEX IF NOT EXISTS idx_anexos_mensagem ON suporte_anexos(mensagem_id) WHERE mensagem_id IS NOT NULL;

-- ─── 2. Biblioteca de templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS suporte_templates_msg (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL CHECK (tipo IN ('email', 'whatsapp')),
  nome         TEXT NOT NULL,
  assunto      TEXT,                          -- só pra email
  conteudo     TEXT NOT NULL,                 -- HTML pra email, texto pra wa
  variaveis    TEXT[] DEFAULT '{}',           -- lista de {var} no template
  criado_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (tipo, nome)
);

CREATE INDEX IF NOT EXISTS idx_templates_tipo ON suporte_templates_msg(tipo, nome);

-- Templates iniciais úteis
INSERT INTO suporte_templates_msg (tipo, nome, assunto, conteudo, variaveis) VALUES
  ('email', 'Reenvio de credenciais',
   'Suas credenciais de acesso',
   '<p>Olá {cliente}!</p><p>Conforme solicitado, segue suas credenciais:</p><p><strong>E-mail:</strong> {email}<br><strong>Senha temporária:</strong> {senha}</p><p>Acesse em: <a href="{link}">{link}</a></p><p>Recomendamos trocar a senha após o primeiro acesso.</p>',
   ARRAY['cliente','email','senha','link']),

  ('email', 'Resolução de chamado',
   'Chamado #{numero} resolvido',
   '<p>Olá {cliente}!</p><p>Seu chamado <strong>{assunto}</strong> foi resolvido com sucesso.</p><p><strong>Solução aplicada:</strong></p><blockquote>{solucao}</blockquote><p>Se o problema voltar, basta responder este e-mail ou abrir novo chamado.</p>',
   ARRAY['cliente','numero','assunto','solucao']),

  ('whatsapp', 'Confirmação de atendimento',
   NULL,
   '👋 Olá {cliente}!\n\nVi seu chamado *{assunto}* e estou trabalhando nele agora. Em até *{tempo}* retorno com solução.\n\n— {operador}',
   ARRAY['cliente','assunto','tempo','operador']),

  ('whatsapp', 'Pedido de mais informações',
   NULL,
   '🔍 Olá {cliente}!\n\nPra resolver mais rápido o chamado *{assunto}*, preciso que você me envie:\n\n{informacoes}\n\nObrigado! 🙏\n— {operador}',
   ARRAY['cliente','assunto','informacoes','operador']),

  ('whatsapp', 'Solicitação de revisão',
   NULL,
   '✅ {cliente}, finalizei o atendimento do seu chamado *{assunto}*.\n\nVocê poderia confirmar se está tudo certo? Se sim, marco como resolvido. 😊\n\n{link}\n\n— {operador}',
   ARRAY['cliente','assunto','link','operador'])
ON CONFLICT (tipo, nome) DO NOTHING;
