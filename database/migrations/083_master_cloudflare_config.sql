-- 083_master_cloudflare_config.sql
-- Configuração Cloudflare salva no master: token API + account_id + zone_id.
-- Salvar 1× só, todas as instalações de retaguarda usam.
-- Token é cifrado com ENCRYPTION_KEY (prefix "encrypted:").

CREATE TABLE IF NOT EXISTS master_cloudflare_config (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_token       TEXT,           -- cifrado com prefix "encrypted:"
  account_id      TEXT,
  zone_id         TEXT,
  base_domain     TEXT DEFAULT 'tthreedigital.com.br',
  ativo           BOOLEAN DEFAULT TRUE,
  validado_em     TIMESTAMPTZ,    -- última verificação contra CF API
  validado_ok     BOOLEAN,
  validado_erro   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Singleton: força sempre 1 linha
INSERT INTO master_cloudflare_config (id) VALUES (1) ON CONFLICT DO NOTHING;

COMMENT ON TABLE master_cloudflare_config IS
  'Credenciais Cloudflare do master pra auto-provisionar tunnels nas retaguardas. ' ||
  'api_token cifrado com ENCRYPTION_KEY. Usado por /api/retaguarda/install-config ' ||
  'quando install-token tem flag include_cf=true.';
