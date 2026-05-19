-- 089_saas_branding_default.sql
-- Configura saas_branding inicial com Three Digital.
--
-- Faz INSERT se chave 'saas_branding' não existe.
-- Se existir, só atualiza se nome estiver vazio ou for o default antigo.
-- Não sobrescreve customizações que o operador master já tenha feito.

INSERT INTO settings (chave, valor, descricao, updated_at)
VALUES (
  'saas_branding',
  jsonb_build_object(
    'nome',         'Three Digital',
    'site',         'https://tthreedigital.com.br',
    'email',        'contato@tthreedigital.com.br',
    'logo_url',     NULL,
    'telefone',     NULL,
    'whatsapp',     NULL,
    'dpo_nome',     NULL,
    'dpo_email',    NULL,
    'dpo_telefone', NULL,
    'endereco',     NULL,
    'cnpj',         NULL,
    'razao_social', NULL
  ),
  'Branding do dono do SaaS — nome, logo, contato, dados LGPD',
  NOW()
)
ON CONFLICT (chave) DO UPDATE SET
  valor = CASE
    -- Se o nome atual é o default antigo 'Cardápio SaaS' ou vazio,
    -- substitui pelo novo. Caso contrário preserva customização.
    WHEN COALESCE(settings.valor->>'nome', '') IN ('', 'Cardápio SaaS', 'Cardapio SaaS')
      THEN jsonb_set(
             COALESCE(settings.valor, '{}'::jsonb),
             '{nome}',
             '"Three Digital"'::jsonb
           )
    ELSE settings.valor
  END,
  updated_at = NOW();
