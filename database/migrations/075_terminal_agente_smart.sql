-- 075_terminal_agente_smart.sql
-- Suporte ao driver "cielo_smart_agent": o totem enfileira a cobrança e um app
-- rodando NO terminal Cielo Smart (L400) pega via polling, cobra pelo SDK local
-- e devolve o resultado. Comunicação autenticada por agent_token do terminal.

-- Token único do terminal (o app no L400 usa pra autenticar no nosso backend)
ALTER TABLE empresa_terminais ADD COLUMN IF NOT EXISTS agent_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_agent_token
  ON empresa_terminais(agent_token) WHERE agent_token IS NOT NULL;

-- Heartbeat: última vez que o app do terminal deu sinal de vida
ALTER TABLE empresa_terminais ADD COLUMN IF NOT EXISTS agente_visto_em TIMESTAMPTZ;

-- Claim: evita que dois polls peguem a mesma cobrança (e permite retry por timeout)
ALTER TABLE terminal_transacoes ADD COLUMN IF NOT EXISTS agente_claim_em TIMESTAMPTZ;

-- Índice pra busca rápida da próxima cobrança pendente por terminal
CREATE INDEX IF NOT EXISTS idx_tt_fila_agente
  ON terminal_transacoes(terminal_id, status, agente_claim_em);
