-- 087_empresas_textos_longos.sql
-- Aumenta limites de VARCHAR pra campos texto que o usuário preenche no
-- /painel/config. PG era estourado com "value too long for type
-- character varying(50)".
--
-- Convertendo pra TEXT (sem limite). Performance é idêntica em PG —
-- TEXT e VARCHAR(n) usam mesmo tipo interno, só muda o constraint.

ALTER TABLE empresas
  ALTER COLUMN inscricao_estadual    TYPE TEXT,
  ALTER COLUMN inscricao_municipal   TYPE TEXT,
  ALTER COLUMN regime_tributario     TYPE TEXT,
  ALTER COLUMN endereco_cep          TYPE TEXT,
  ALTER COLUMN endereco_numero       TYPE TEXT,
  ALTER COLUMN endereco_uf           TYPE VARCHAR(10),
  ALTER COLUMN endereco_bairro       TYPE TEXT,
  ALTER COLUMN endereco_cidade       TYPE TEXT,
  ALTER COLUMN gestor_nome           TYPE TEXT,
  ALTER COLUMN gestor_cpf            TYPE TEXT,
  ALTER COLUMN gestor_rg             TYPE TEXT,
  ALTER COLUMN gestor_telefone       TYPE TEXT,
  ALTER COLUMN gestor_email          TYPE TEXT,
  ALTER COLUMN totem_cor_destaque    TYPE TEXT,
  ALTER COLUMN totem_pos_destaque    TYPE TEXT,
  ALTER COLUMN totem_tema            TYPE TEXT,
  ALTER COLUMN tema                  TYPE TEXT,
  ALTER COLUMN cadastro_status       TYPE TEXT,
  ALTER COLUMN status                TYPE TEXT;

-- Tambem nas tabelas onde tem campos curtos demais frequentemente
ALTER TABLE empresas
  ALTER COLUMN nome_fantasia         TYPE TEXT,
  ALTER COLUMN razao_social          TYPE TEXT,
  ALTER COLUMN telefone              TYPE TEXT,
  ALTER COLUMN whatsapp              TYPE TEXT,
  ALTER COLUMN email                 TYPE TEXT,
  ALTER COLUMN slug                  TYPE TEXT,
  ALTER COLUMN subdominio            TYPE TEXT,
  ALTER COLUMN cor_primaria          TYPE TEXT,
  ALTER COLUMN cor_secundaria        TYPE TEXT;
