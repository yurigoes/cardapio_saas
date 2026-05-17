-- 072_contratos_cobrancas_bloqueio.sql
-- 1) Novo template de contrato (modelo oficial Three Digital)
-- 2) Cobranças avulsas (extras) + flag de bloqueio por inadimplência
-- 3) Tipo de contrato (onboarding vs avulso/anexo)

-- ─── Status explícito de documentos (pendente/aprovado/rejeitado) ──
ALTER TABLE empresa_documentos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','rejeitado'));

-- Backfill: quem tinha validado=TRUE vira 'aprovado'
UPDATE empresa_documentos SET status = 'aprovado' WHERE validado = TRUE AND status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_empdoc_status ON empresa_documentos(empresa_id, status);

-- ─── Tipo de contrato ──────────────────────────────────────────
ALTER TABLE empresa_contratos
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'onboarding';  -- onboarding | aditivo | avulso

ALTER TABLE contrato_templates
  ADD COLUMN IF NOT EXISTS tipo     TEXT DEFAULT 'onboarding',  -- onboarding | aditivo | servico_extra
  ADD COLUMN IF NOT EXISTS descricao TEXT;

-- ─── Cobranças avulsas (manuais ou de módulo extra) ────────────
CREATE TABLE IF NOT EXISTS cobrancas_avulsas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  origem          TEXT NOT NULL DEFAULT 'manual',  -- manual | modulo_extra | ajuste
  origem_ref_id   UUID,                            -- ref opcional (ex: empresa_modulos_extras.id)
  nome            TEXT NOT NULL,                   -- "Setup inicial", "Hora técnica", etc
  motivo          TEXT,                            -- descrição livre
  valor           NUMERIC(10,2) NOT NULL,
  vencimento      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta','paga','atrasada','cancelada')),
  -- Mercado Pago / pagamento
  mp_preference_id  TEXT,
  mp_payment_id     TEXT,
  mp_init_point     TEXT,
  pago_em           TIMESTAMPTZ,
  pago_via          TEXT,                          -- pix | boleto | cartao | dinheiro
  comprovante_url   TEXT,
  -- Audit
  criado_por        UUID REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cobav_empresa ON cobrancas_avulsas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cobav_status  ON cobrancas_avulsas(status);
CREATE INDEX IF NOT EXISTS idx_cobav_vencimento ON cobrancas_avulsas(vencimento);

-- ─── Bloqueio por inadimplência (registrado na empresa) ────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS bloqueado_inadimplencia BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bloqueado_motivo        TEXT,
  ADD COLUMN IF NOT EXISTS bloqueado_em            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_empresas_bloqueada
  ON empresas(bloqueado_inadimplencia) WHERE bloqueado_inadimplencia = TRUE;

-- ─── Desativa template antigo e insere o novo oficial ──────────
UPDATE contrato_templates SET ativo = FALSE WHERE versao = 'v1.0-2026-05';

INSERT INTO contrato_templates (versao, titulo, descricao, conteudo_html, tipo, ativo)
VALUES (
  'v2.0-2026-05-oficial',
  'Contrato de Prestação de Serviços — Fornecimento de Sistema',
  'Contrato padrão de onboarding usado para todos os novos clientes.',
  $TEMPLATE$
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FORNECIMENTO DE SISTEMA</h1>

<p><strong>CONTRATANTE:</strong> {{contratante_razao_social}}, pessoa jurídica inscrita no CNPJ sob nº {{contratante_cnpj}}, com sede em {{contratante_endereco}}, neste ato representada por seu representante legal {{contratante_representante}}, doravante denominada simplesmente <strong>CONTRATANTE</strong>.</p>

<p><strong>CONTRATADA:</strong> {{contratada_razao_social}}, pessoa jurídica inscrita no CNPJ sob nº {{contratada_cnpj}}, com sede em {{contratada_endereco}}, doravante denominada simplesmente <strong>CONTRATADA</strong>.</p>

<p>As partes acima identificadas resolvem celebrar o presente <strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FORNECIMENTO DE SISTEMA</strong>, que será regido pelas cláusulas e condições abaixo:</p>

<hr>

<h2>CLÁUSULA 1 — DO OBJETO</h2>
<p>1.1. O presente contrato tem por objeto a disponibilização, licenciamento de uso, manutenção, hospedagem e suporte técnico de sistema(s) fornecido(s) pela CONTRATADA, incluindo infraestrutura tecnológica necessária para sua operação.</p>
<p>1.2. O sistema será disponibilizado em ambiente digital, acessível via internet, podendo operar em modalidade totalmente em nuvem ou híbrida, conforme plano contratado pela CONTRATANTE.</p>
<p>1.3. A CONTRATADA disponibilizará acesso ao painel administrativo online para gerenciamento de usuários, serviços contratados, upgrades, downgrades, pagamentos e demais funcionalidades administrativas.</p>

<h2>CLÁUSULA 2 — DOS PLANOS E MODALIDADES DE SERVIÇO</h2>
<p>2.1. A CONTRATANTE poderá optar por uma das seguintes modalidades de serviço:</p>
<h3>I — SERVIÇO TOTALMENTE EM NUVEM</h3>
<p>Sistema hospedado integralmente em servidores da CONTRATADA, com acesso via internet.</p>
<h3>II — SERVIÇO COM RETAGUARDA LOCAL</h3>
<p>Sistema em nuvem com servidor local de retaguarda instalado no estabelecimento da CONTRATANTE, destinado à preservação temporária de dados e continuidade operacional em casos de:</p>
<ul>
  <li>indisponibilidade temporária do servidor principal;</li>
  <li>falhas de conectividade;</li>
  <li>quedas de energia;</li>
  <li>interrupções externas.</li>
</ul>
<h3>III — SERVIÇO COM RETAGUARDA LOCAL + CHIP DE INTERNET (LOAD BALANCE)</h3>
<p>Sistema com infraestrutura híbrida contendo:</p>
<ul>
  <li>servidor local de retaguarda;</li>
  <li>conexão redundante através de chip de internet móvel;</li>
  <li>sistema de load balance/failover automático para continuidade de operação em casos de falha da internet principal.</li>
</ul>
<p>2.2. A CONTRATANTE poderá realizar upgrade ou downgrade de plano a qualquer momento através do painel administrativo online, respeitando as condições comerciais vigentes na data da alteração.</p>
<p>2.3. Alterações de plano poderão gerar atualização proporcional de valores na próxima cobrança ou cobrança complementar proporcional ao período utilizado.</p>

<h2>CLÁUSULA 3 — DA DISPONIBILIDADE DOS SERVIÇOS</h2>
<p>3.1. A CONTRATADA compromete-se a manter os serviços disponíveis 24 (vinte e quatro) horas por dia, 7 (sete) dias por semana.</p>
<p>3.2. A disponibilidade média mensal dos servidores poderá variar entre <strong>85% (oitenta e cinco por cento) e 99,5% (noventa e nove vírgula cinco por cento)</strong>, dependendo de fatores externos, manutenções programadas, falhas de infraestrutura de terceiros, energia elétrica, operadoras de internet e demais fatores alheios ao controle da CONTRATADA.</p>
<p>3.3. Não serão considerados como indisponibilidade:</p>
<ul>
  <li>manutenções preventivas;</li>
  <li>atualizações de sistema;</li>
  <li>falhas provocadas por terceiros;</li>
  <li>interrupções de energia;</li>
  <li>ataques cibernéticos;</li>
  <li>problemas de internet da CONTRATANTE;</li>
  <li>falhas em equipamentos locais da CONTRATANTE;</li>
  <li>casos fortuitos ou força maior.</li>
</ul>
<p>3.4. Sempre que possível, as manutenções programadas serão comunicadas previamente.</p>

<h2>CLÁUSULA 4 — DOS PAGAMENTOS</h2>
<p>4.1. Os pagamentos serão realizados diretamente através do sistema/painel online disponibilizado pela CONTRATADA.</p>
<p>4.2. A CONTRATANTE poderá efetuar pagamentos via meios eletrônicos disponíveis na plataforma, incluindo cartão de crédito, boleto bancário, PIX ou outros meios disponibilizados.</p>
<p>4.3. O não pagamento até a data de vencimento poderá acarretar:</p>
<ul>
  <li>suspensão parcial dos serviços;</li>
  <li>limitação de funcionalidades;</li>
  <li>bloqueio temporário de acesso;</li>
  <li>rescisão contratual após prazo de inadimplência.</li>
</ul>
<p>4.4. Em caso de atraso, poderão incidir:</p>
<ul>
  <li>multa de até 2% (dois por cento);</li>
  <li>juros de 1% (um por cento) ao mês;</li>
  <li>correção monetária conforme índice aplicável.</li>
</ul>

<h2>CLÁUSULA 5 — DAS RESPONSABILIDADES DA CONTRATADA</h2>
<p>5.1. São responsabilidades da CONTRATADA:</p>
<ul>
  <li>disponibilizar o sistema conforme contratado;</li>
  <li>manter infraestrutura compatível para operação dos serviços;</li>
  <li>realizar suporte técnico conforme canais disponibilizados;</li>
  <li>executar backups internos conforme política operacional;</li>
  <li>adotar medidas razoáveis de segurança da informação;</li>
  <li>proteger os dados conforme a Lei Geral de Proteção de Dados (LGPD).</li>
</ul>
<p>5.2. A CONTRATADA não será responsável por:</p>
<ul>
  <li>falhas de energia elétrica;</li>
  <li>problemas de internet da CONTRATANTE;</li>
  <li>mau uso do sistema;</li>
  <li>exclusão de dados realizada pela própria CONTRATANTE;</li>
  <li>compartilhamento indevido de senhas;</li>
  <li>invasões decorrentes de falhas nos dispositivos da CONTRATANTE.</li>
</ul>

<h2>CLÁUSULA 6 — DAS RESPONSABILIDADES DA CONTRATANTE</h2>
<p>6.1. São responsabilidades da CONTRATANTE:</p>
<ul>
  <li>utilizar o sistema de forma legal e adequada;</li>
  <li>manter sigilo de senhas e acessos;</li>
  <li>fornecer equipamentos compatíveis;</li>
  <li>manter conexão de internet funcional;</li>
  <li>realizar os pagamentos nas datas acordadas;</li>
  <li>respeitar os limites técnicos e operacionais do sistema.</li>
</ul>
<p>6.2. A CONTRATANTE declara estar ciente de que determinadas ações realizadas no painel administrativo poderão resultar em exclusão permanente de dados.</p>
<p>6.3. Sempre que houver funcionalidade de exclusão definitiva, o sistema exibirá aviso informativo e confirmação da operação.</p>
<p>6.4. Após confirmação da exclusão definitiva pela CONTRATANTE, a recuperação dos dados poderá ser impossível ou sujeita à análise técnica e custos adicionais.</p>

<h2>CLÁUSULA 7 — DA LGPD E PROTEÇÃO DE DADOS</h2>
<p>7.1. As partes comprometem-se a cumprir integralmente a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados (LGPD).</p>
<p>7.2. A CONTRATADA adotará medidas técnicas e administrativas razoáveis para proteção dos dados tratados no sistema.</p>
<p>7.3. A CONTRATANTE declara ciência de que:</p>
<ul>
  <li>é responsável pelos dados inseridos na plataforma;</li>
  <li>deve obter consentimentos necessários quando exigidos;</li>
  <li>deverá utilizar o sistema em conformidade com a legislação vigente.</li>
</ul>
<p>7.4. Em caso de solicitação de exclusão de dados pela CONTRATANTE através do painel administrativo, a ação poderá resultar em eliminação definitiva das informações, conforme aviso exibido no próprio sistema.</p>

<h2>CLÁUSULA 8 — DO SUPORTE TÉCNICO</h2>
<p>8.1. O suporte técnico será realizado pelos canais disponibilizados pela CONTRATADA.</p>
<p>8.2. O suporte poderá ocorrer em horário comercial, salvo contratação específica de suporte diferenciado.</p>
<p>8.3. Demandas relacionadas a falhas externas, operadoras, infraestrutura local ou equipamentos da CONTRATANTE poderão não ser cobertas pelo suporte padrão.</p>

<h2>CLÁUSULA 9 — DA VIGÊNCIA</h2>
<p>9.1. O presente contrato possui vigência por prazo indeterminado, iniciando-se na data da contratação.</p>
<p>9.2. Qualquer das partes poderá rescindir o presente contrato mediante aviso prévio de 30 (trinta) dias.</p>

<h2>CLÁUSULA 10 — DA RESCISÃO</h2>
<p>10.1. O contrato poderá ser rescindido imediatamente em caso de:</p>
<ul>
  <li>descumprimento contratual;</li>
  <li>uso indevido do sistema;</li>
  <li>práticas ilícitas;</li>
  <li>inadimplência prolongada;</li>
  <li>violação de segurança.</li>
</ul>
<p>10.2. Após a rescisão, a CONTRATADA poderá manter os dados armazenados pelo prazo legal e operacional necessário, podendo posteriormente realizar exclusão definitiva.</p>

<h2>CLÁUSULA 11 — DAS DISPOSIÇÕES GERAIS</h2>
<p>11.1. A tolerância de uma parte para com a outra quanto ao descumprimento de qualquer obrigação não implicará renúncia de direito.</p>
<p>11.2. Este contrato poderá ser atualizado periodicamente pela CONTRATADA para adequações técnicas, legais ou operacionais.</p>
<p>11.3. A continuidade de uso do sistema após atualizações contratuais implicará concordância com os novos termos.</p>
<p>11.4. Este contrato não gera vínculo empregatício, societário ou de exclusividade entre as partes.</p>

<h2>CLÁUSULA 12 — DO FORO</h2>
<p>12.1. Fica eleito o foro da comarca de {{contratada_cidade}}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir quaisquer controvérsias oriundas deste contrato.</p>

<p>E por estarem assim justas e contratadas, firmam o presente instrumento em duas vias de igual teor.</p>

<p><strong>{{contratante_cidade}}, {{data_contrato}}.</strong></p>

<hr>
<h3>CONTRATANTE</h3>
<p>Nome: {{contratante_representante}}<br>
CPF/CNPJ: {{contratante_cnpj}}<br>
Assinatura eletrônica registrada via clickwrap.</p>

<hr>
<h3>CONTRATADA</h3>
<p>Nome: {{contratada_razao_social}}<br>
CPF/CNPJ: {{contratada_cnpj}}<br>
Assinatura eletrônica registrada digitalmente.</p>
  $TEMPLATE$,
  'onboarding',
  TRUE
)
ON CONFLICT (versao) DO NOTHING;
