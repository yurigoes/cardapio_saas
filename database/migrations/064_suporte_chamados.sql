-- 064_suporte_chamados.sql
-- Sistema de chamados/chat ao vivo do suporte.
-- Estrutura abstrata (pode ser substituída por GLPI no futuro mantendo
-- mesma interface no app).

CREATE TABLE IF NOT EXISTS suporte_chamados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- quem abriu
  atribuido_a     UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- agente master responsável
  assunto         TEXT NOT NULL,
  prioridade      TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status          TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','aguardando_cliente','resolvido','fechado')),
  canal           TEXT NOT NULL DEFAULT 'chat' CHECK (canal IN ('chat','email','whatsapp','telefone','outro')),
  tags            TEXT[],
  externo_id      TEXT,                          -- pra integração GLPI futura
  externo_sistema TEXT,                          -- 'glpi', 'zendesk', etc
  criado_em       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  fechado_em      TIMESTAMP WITH TIME ZONE,
  primeira_resposta_em TIMESTAMP WITH TIME ZONE,
  ultima_msg_em   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ultima_msg_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chamados_empresa     ON suporte_chamados(empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_chamados_status      ON suporte_chamados(status, prioridade, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_chamados_atribuido   ON suporte_chamados(atribuido_a) WHERE atribuido_a IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chamados_externo     ON suporte_chamados(externo_sistema, externo_id) WHERE externo_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS suporte_mensagens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id      UUID NOT NULL REFERENCES suporte_chamados(id) ON DELETE CASCADE,
  autor_id        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_tipo      TEXT NOT NULL CHECK (autor_tipo IN ('cliente','agente','sistema')),
  autor_nome      TEXT NOT NULL,                  -- snapshot do nome (sobrevive deleção)
  texto           TEXT NOT NULL,
  anexos          JSONB DEFAULT '[]'::jsonb,      -- [{url, nome, tipo, tamanho}]
  interno         BOOLEAN NOT NULL DEFAULT FALSE, -- nota visível só pra equipe
  criado_em       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  lido_em         TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_mensagens_chamado    ON suporte_mensagens(chamado_id, criado_em ASC);
CREATE INDEX IF NOT EXISTS idx_mensagens_nao_lidas  ON suporte_mensagens(chamado_id) WHERE lido_em IS NULL;

-- Configuração de horários de atendimento (1 row por SaaS)
CREATE TABLE IF NOT EXISTS suporte_horarios (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  fuso            TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  -- horários por dia [{ dia: 'seg', inicio: '09:00', fim: '18:00' }]
  horarios        JSONB NOT NULL DEFAULT '[]'::jsonb,
  mensagem_offline TEXT NOT NULL DEFAULT 'Estamos fora do horário. Abra um chamado e responderemos em breve.',
  email_chamado   TEXT,                           -- pra pra notificar equipe
  atualizado_em   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO suporte_horarios (id, horarios)
  VALUES (1, '[
    {"dia":"seg","inicio":"09:00","fim":"18:00"},
    {"dia":"ter","inicio":"09:00","fim":"18:00"},
    {"dia":"qua","inicio":"09:00","fim":"18:00"},
    {"dia":"qui","inicio":"09:00","fim":"18:00"},
    {"dia":"sex","inicio":"09:00","fim":"18:00"},
    {"dia":"sab","inicio":"09:00","fim":"13:00"}
  ]'::jsonb)
  ON CONFLICT (id) DO NOTHING;

-- Sessão de personificação (master vira temporariamente outro usuário)
CREATE TABLE IF NOT EXISTS suporte_personificacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alvo_id         UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  motivo          TEXT,
  iniciado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finalizado_em   TIMESTAMP WITH TIME ZONE,
  ip_origem       INET
);

CREATE INDEX IF NOT EXISTS idx_personificacoes_ativas
  ON suporte_personificacoes(master_id) WHERE finalizado_em IS NULL;
