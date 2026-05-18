-- 077_cardapio_rede_backfill.sql
-- Quando empresa entra numa rede com cardapio_sincronizado, queremos que
-- os produtos/categorias EXISTENTES da matriz fiquem disponíveis pra todas
-- filiais. Backfill: copia rede_id da empresa MATRIZ pros seus produtos/categorias.
--
-- IMPORTANTE: só backfilla produtos da MATRIZ (não duplica de filiais —
-- o admin escolhe qual cardápio é o "oficial" definindo qual empresa
-- vira matriz).

-- Produtos da matriz ganham rede_id da rede
UPDATE produtos p
   SET rede_id = e.rede_id
  FROM empresas e
 WHERE p.empresa_id = e.id
   AND e.is_matriz = TRUE
   AND e.rede_id IS NOT NULL
   AND p.rede_id IS NULL;

-- Categorias da matriz ganham rede_id da rede
UPDATE categorias c
   SET rede_id = e.rede_id
  FROM empresas e
 WHERE c.empresa_id = e.id
   AND e.is_matriz = TRUE
   AND e.rede_id IS NOT NULL
   AND c.rede_id IS NULL;

-- Log no console (psql) pro admin saber quantos foram atualizados
DO $$
DECLARE
  qtd_prod INT;
  qtd_cat  INT;
BEGIN
  SELECT COUNT(*) INTO qtd_prod FROM produtos WHERE rede_id IS NOT NULL;
  SELECT COUNT(*) INTO qtd_cat  FROM categorias WHERE rede_id IS NOT NULL;
  RAISE NOTICE 'Backfill cardápio rede: % produtos, % categorias agora compartilhados', qtd_prod, qtd_cat;
END $$;
