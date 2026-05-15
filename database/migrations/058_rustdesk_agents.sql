-- 058_rustdesk_agents.sql
-- Liga nossos agentes ao RustDesk: cada agente registrado pode ter um
-- rustdesk_id (ID estável que o cliente RustDesk usa no relay) + senha
-- permanente (gerada e mostrada uma vez ao usuário).
--
-- Master tem botão "Conectar" que abre rustdesk://CONNECT?ID=<rd>&PASSWORD=<pw>
-- O navegador chama o cliente RustDesk instalado, que conecta direto.

ALTER TABLE agentes
  ADD COLUMN IF NOT EXISTS rustdesk_id          TEXT,
  ADD COLUMN IF NOT EXISTS rustdesk_password    TEXT,    -- cifrada com encryptField
  ADD COLUMN IF NOT EXISTS rustdesk_registrado_em TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rustdesk_auto_aceite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_agentes_rustdesk_id
  ON agentes(rustdesk_id) WHERE rustdesk_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN agentes.rustdesk_id IS
  'ID do agente no RustDesk (9 dígitos). Definido pelo cliente RustDesk no primeiro start.';
COMMENT ON COLUMN agentes.rustdesk_password IS
  'Senha permanente cifrada (AES-256-GCM via encryptField). Mostrada UMA vez ao registrar.';
COMMENT ON COLUMN agentes.rustdesk_auto_aceite IS
  'Se true, agente aceita conexão do master sem prompt (TI/suporte). Se false, popup pede confirmação.';
