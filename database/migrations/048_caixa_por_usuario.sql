-- 048_caixa_por_usuario.sql
-- Permite múltiplos caixas abertos simultaneamente por empresa, desde que
-- de usuários diferentes. Cada operador pode ter o "seu caixa" enquanto
-- outro operador tem o dele aberto. Usuários ainda podem optar por usar
-- caixa de outro operador (compartilhado) — controlado a nível de aplicação.

DROP INDEX IF EXISTS idx_caixas_aberto_unique;

-- Novo índice: 1 caixa aberto por (empresa, usuário_abertura)
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_aberto_por_usuario
  ON caixas(empresa_id, usuario_abertura_id)
  WHERE status = 'aberto';

CREATE INDEX IF NOT EXISTS idx_caixas_aberto_status
  ON caixas(empresa_id, status, usuario_abertura_id);
