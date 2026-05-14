-- ═══════════════════════════════════════════════════════════════
--  Migration 046 — sincroniza planos.preco e planos.preco_mensal
--
--  Sintoma: landing page lê preco_mensal (com valores), admin lê
--  preco (zero). Migration backfilla os dois lados pra ficar igual.
-- ═══════════════════════════════════════════════════════════════

-- Garante coluna preco_mensal (já existe da migration 003 mas
-- com SAFE em caso de DB antigo)
ALTER TABLE planos ADD COLUMN IF NOT EXISTS preco_mensal NUMERIC(10,2) DEFAULT 0;

-- Sincroniza: se preco=0 mas preco_mensal>0, copia de mensal pra preco
UPDATE planos
   SET preco = preco_mensal
 WHERE COALESCE(preco, 0) = 0
   AND COALESCE(preco_mensal, 0) > 0;

-- Vice-versa: se preco_mensal=0 mas preco>0, copia
UPDATE planos
   SET preco_mensal = preco
 WHERE COALESCE(preco_mensal, 0) = 0
   AND COALESCE(preco, 0) > 0;
