-- ─────────────────────────────────────────────────────────────────────────────
-- 022 — Corrige IDs de módulos em empresas existentes
-- ─────────────────────────────────────────────────────────────────────────────
-- O seed 004 e empresas migradas têm IDs antigos que não batem com o registry
-- atual em src/lib/modules/registry.ts. Isso faz assertModuloAtivo() falhar
-- silenciosamente em endpoints como POST /api/pedidos.
--
-- Mapeamento aplicado:
--   mesas       → mesa
--   kds         → cozinha_kds
--   cardapio    → cardapio_digital
--   relatorios  → relatorios_basicos
--   clientes    → crm
--   cupons      → cupom
--   pedidos     → (removido, não é módulo)
--   gateways    → (removido, não é módulo)
--   integracoes → (removido, não é módulo)
--
-- Adiciona também 'balcao' (faltava no seed mesmo sendo módulo essencial).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_empresa RECORD;
  v_novos   JSONB;
  v_id      TEXT;
  v_mapped  TEXT;
  v_arr     TEXT[] := '{}';
BEGIN
  FOR v_empresa IN
    SELECT id, modulos_ativos
      FROM empresas
     WHERE deleted_at IS NULL
       AND modulos_ativos IS NOT NULL
       AND jsonb_typeof(modulos_ativos) = 'array'
  LOOP
    v_arr := '{}';
    FOR v_id IN SELECT jsonb_array_elements_text(v_empresa.modulos_ativos) LOOP
      v_mapped := CASE v_id
        WHEN 'mesas'       THEN 'mesa'
        WHEN 'kds'         THEN 'cozinha_kds'
        WHEN 'cardapio'    THEN 'cardapio_digital'
        WHEN 'relatorios'  THEN 'relatorios_basicos'
        WHEN 'clientes'    THEN 'crm'
        WHEN 'cupons'      THEN 'cupom'
        WHEN 'pedidos'     THEN NULL          -- não é módulo
        WHEN 'gateways'    THEN NULL          -- não é módulo
        WHEN 'integracoes' THEN NULL          -- não é módulo
        ELSE v_id
      END;
      IF v_mapped IS NOT NULL AND NOT (v_mapped = ANY(v_arr)) THEN
        v_arr := array_append(v_arr, v_mapped);
      END IF;
    END LOOP;

    -- Garante 'balcao' (essencial — sempre existe no ponto de venda)
    IF NOT ('balcao' = ANY(v_arr)) THEN
      v_arr := array_append(v_arr, 'balcao');
    END IF;

    v_novos := to_jsonb(v_arr);

    UPDATE empresas SET modulos_ativos = v_novos, updated_at = NOW()
     WHERE id = v_empresa.id;
  END LOOP;
END $$;

-- Default para empresas novas: pacote essencial não-premium
ALTER TABLE empresas
  ALTER COLUMN modulos_ativos
  SET DEFAULT '["cardapio_digital","mesa","balcao","delivery","cozinha_kds","garcom","financeiro","relatorios_basicos","crm","cupom","whatsapp","pix","impressoras","notificacoes","autoatendimento_qrcode"]'::jsonb;
