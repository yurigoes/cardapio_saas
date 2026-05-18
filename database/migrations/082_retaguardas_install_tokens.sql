-- 082_retaguardas_install_tokens.sql
-- Tokens de uso único pra wizard de instalação remota da retaguarda.
-- Master gera → operador no campo cola/curl no mini-PC → o setup.sh resolve
-- o token via API e recebe a config completa (sem precisar copiar/colar
-- HEARTBEAT_SECRET, CF token, etc).

CREATE TABLE IF NOT EXISTS retaguardas_install_tokens (
  token         TEXT PRIMARY KEY,                  -- string aleatória (use openssl rand -hex 24)
  empresa_id    UUID REFERENCES empresas(id) ON DELETE CASCADE,
  empresa_slug  TEXT NOT NULL,                     -- pra setup pré-preencher
  subdomain     TEXT NOT NULL,                     -- ex: "loja-shopping"
  base_domain   TEXT NOT NULL,                     -- ex: "tthreedigital.com.br"
  expires_at    TIMESTAMPTZ NOT NULL,              -- 24h normalmente
  consumed_at   TIMESTAMPTZ,                       -- preenchido quando setup chama /api/retaguarda/setup
  consumed_ip   INET,
  retaguarda_id UUID,                              -- preenchido depois (id que o setup gerar)
  created_by    UUID,                              -- master que criou
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retaguardas_install_tokens_expires
  ON retaguardas_install_tokens(expires_at) WHERE consumed_at IS NULL;

COMMENT ON TABLE retaguardas_install_tokens IS
  'One-time tokens pra setup remoto da retaguarda. Operador no master gera, ' ||
  'copia o comando curl, e cola no mini-PC novo. Setup.sh consulta o token, ' ||
  'recebe config (slug, heartbeat secret, CF token cifrado), executa, marca consumed.';
