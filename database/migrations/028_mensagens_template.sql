-- ─────────────────────────────────────────────────────────────────────────────
-- 028 — Templates de mensagem por empresa (Evolution / WhatsApp)
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite a empresa customizar o texto enviado para cada evento.
-- Sem registro = usa default hardcoded em src/lib/notify/evolution.ts.
--
-- Variáveis suportadas no texto:
--   {empresa}  → nome_fantasia
--   {numero}   → número do pedido
--   {cliente}  → nome do cliente
--   {total}    → total formatado (R$ 0,00)
--   {telefone} → telefone do cliente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mensagens_template (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evento      VARCHAR(50)  NOT NULL,
    -- novo_pedido | confirmado | pronto | cancelado | novo_cliente
  texto       TEXT         NOT NULL,
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT mensagens_template_empresa_evento_unique UNIQUE (empresa_id, evento)
);

CREATE INDEX IF NOT EXISTS idx_mensagens_template_empresa
  ON mensagens_template (empresa_id);
