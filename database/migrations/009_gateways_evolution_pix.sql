-- Migration 009 — Gateways, Evolution config, PIX, N8N

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS pix_tipo        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pix_chave       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pix_favorecido  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS evolution_url   TEXT,
  ADD COLUMN IF NOT EXISTS evolution_key   TEXT,
  ADD COLUMN IF NOT EXISTS evolution_eventos TEXT DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS n8n_url         TEXT,
  ADD COLUMN IF NOT EXISTS n8n_token       TEXT,
  ADD COLUMN IF NOT EXISTS n8n_eventos     TEXT DEFAULT '[]';
