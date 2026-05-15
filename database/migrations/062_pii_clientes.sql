-- 062_pii_clientes.sql
-- Cifra PII (telefone) na tabela clientes pra atender LGPD.
-- Estratégia: adiciona coluna telefone_cifrado, mantém telefone normal
-- pra compatibilidade. App pode escrever em ambas; novas leituras
-- preferem cifrado se existir.
--
-- Migração de dados existentes deve ser feita por script à parte
-- (scripts/migrate-pii.ts) — esta migration só adiciona schema.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS telefone_cifrado TEXT;

COMMENT ON COLUMN clientes.telefone_cifrado IS
  'Telefone cifrado AES-256-GCM (encryptField). Preferir este sobre telefone em leituras.';

-- Index pra busca por telefone hashado (se quisermos buscar por equality)
-- usar SHA256 hash separado, não índice em campo cifrado.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS telefone_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_clientes_telefone_hash
  ON clientes(empresa_id, telefone_hash)
  WHERE telefone_hash IS NOT NULL;

COMMENT ON COLUMN clientes.telefone_hash IS
  'SHA256 do telefone normalizado. Permite busca por equality sem decifrar.';
