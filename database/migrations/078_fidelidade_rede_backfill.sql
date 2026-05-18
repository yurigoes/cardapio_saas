-- 078_fidelidade_rede_backfill.sql
-- Backfill clientes.rede_id pra fidelidade cross-filial.
-- Quando rede tem fidelidade_cross_filial=TRUE, clientes da MATRIZ
-- ganham rede_id pra serem visíveis em todas filiais.

UPDATE clientes c
   SET rede_id = e.rede_id
  FROM empresas e
 WHERE c.empresa_id = e.id
   AND e.is_matriz = TRUE
   AND e.rede_id IS NOT NULL
   AND c.rede_id IS NULL
   AND EXISTS (
     SELECT 1 FROM redes r
      WHERE r.id = e.rede_id AND r.fidelidade_cross_filial = TRUE
   );

DO $$
DECLARE
  qtd INT;
BEGIN
  SELECT COUNT(*) INTO qtd FROM clientes WHERE rede_id IS NOT NULL;
  RAISE NOTICE 'Backfill fidelidade: % clientes agora compartilhados em redes', qtd;
END $$;
