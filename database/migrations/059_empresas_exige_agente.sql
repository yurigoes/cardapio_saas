-- 059_empresas_exige_agente.sql
-- Permite à empresa exigir que terminais (PDV/caixa) tenham agente
-- registrado pra operar. Quando true, painel mostra modal bloqueante
-- na primeira abertura naquela máquina exigindo cole de token.

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS exige_agente_terminal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN empresas.exige_agente_terminal IS
  'Se true, painel exige token de agente registrado pra operar (modal bloqueante). Permite rastrear qual máquina fez qual ação + suporte remoto via RustDesk.';

-- Telemetria adicional do agente (opcional)
ALTER TABLE agentes
  ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS user_agent_ultimo   TEXT,
  ADD COLUMN IF NOT EXISTS resolucao           TEXT;
