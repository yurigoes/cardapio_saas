-- 060_agentes_screen_mirror.sql
-- Adiciona campos pra screen mirror dos agentes kiosk/tv:
--   ultimo_frame_data: PNG base64 do último snapshot da tela (até ~300KB)
--   ultimo_frame_em:   timestamp do último frame recebido
--   frame_w, frame_h:  dimensões do canvas capturado
--
-- Uso:
--   - Kiosk envia POST /api/sync/kiosk-frame a cada 8s com base64 PNG
--   - Master visualiza via GET /api/admin/agentes/[id]/last-frame
--   - Página /admin/maquinas/[id]/espelho faz polling de 3s

ALTER TABLE agentes
  ADD COLUMN IF NOT EXISTS ultimo_frame_data TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_frame_em   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS frame_w           INT,
  ADD COLUMN IF NOT EXISTS frame_h           INT;

COMMENT ON COLUMN agentes.ultimo_frame_data IS
  'PNG base64 (data URL completo) do último frame da tela. Usado pra spectator master de kiosks/TVs.';
