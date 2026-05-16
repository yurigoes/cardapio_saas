-- 069_master_evolution.sql
-- Configuração Evolution dedicada do master/SaaS.
-- Empresas têm a própria config (em empresas.evolution_url/_key/_instance);
-- Master tem essa pra notificações internas (alertas, suporte, etc).

CREATE TABLE IF NOT EXISTS master_evolution_config (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  url             TEXT,                          -- ex: https://evolution.tthreedigital.com.br
  api_key         TEXT,                          -- AES cifrada (encryptField)
  instance_name   TEXT,                          -- ex: 'master' ou 'suporte-tt'
  numero_remetente TEXT,                          -- pra exibir
  ultimo_teste_em TIMESTAMP WITH TIME ZONE,
  ultimo_teste_ok BOOLEAN,
  ultimo_teste_msg TEXT,
  atualizado_em   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  atualizado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

INSERT INTO master_evolution_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
