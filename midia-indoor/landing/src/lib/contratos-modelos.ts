/**
 * Modelos de contrato pré-prontos pra Three Digital Mídia (DOOH / mídia indoor).
 *
 * ⚠️ AVISO LEGAL: estes modelos foram redigidos com base na legislação brasileira
 * (Código Civil — Lei 10.406/2002; CDC — Lei 8.078/1990; LGPD — Lei 13.709/2018;
 * Lei de Direitos Autorais — Lei 9.610/1998; Marco Civil da Internet — Lei 12.965/2014).
 * Mesmo assim, NÃO substituem revisão por advogado. Antes de usar em produção,
 * recomenda-se validação jurídica e preenchimento dos dados da CONTRATADA
 * (CNPJ, endereço, foro) nas variáveis de ambiente CONTRATADA_*.
 *
 * Placeholders disponíveis (preenchidos em renderContrato):
 *   {{cliente_nome}} {{cliente_empresa}} {{cliente_email}} {{cliente_whatsapp}}
 *   {{cliente_cidade}} {{cliente_cnpj}} {{cliente_endereco}}
 *   {{plano}} {{qtd_telas}} {{preco_tela}} {{total_mensal}}
 *   {{vigencia_meses}} {{data_inicio}} {{data_fim}} {{foro_comarca}}
 *   {{contratada_nome}} {{contratada_cnpj}} {{contratada_email}} {{contratada_site}}
 *   {{contratada_endereco}} {{contratada_foro}}
 *   {{data}} {{data_extenso}}
 *
 * Campos a preencher manualmente (entre colchetes [ ... ]) ficam pro master
 * editar no admin antes de enviar — ex.: tabela de inventário, valores de caução.
 */

export interface ModeloContrato {
  titulo: string;
  conteudo_html: string;
}

/* ─── Blocos reutilizáveis ──────────────────────────────────────────────── */

const ESTILO = `
<style>
  .contrato { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a2e; }
  .contrato h1 { text-align:center; font-size: 1.4em; margin-bottom: 4px; }
  .contrato h2 { font-size: 1.1em; margin-top: 24px; border-bottom: 2px solid #2d1b69; padding-bottom: 4px; }
  .contrato h3 { font-size: 1em; margin-top: 16px; }
  .contrato p, .contrato li { text-align: justify; }
  .contrato table { width:100%; border-collapse: collapse; margin: 12px 0; }
  .contrato th, .contrato td { border: 1px solid #999; padding: 6px 8px; font-size: 0.92em; text-align:left; }
  .contrato th { background:#f0f0f5; }
  .contrato .assinaturas { margin-top: 48px; display:flex; gap:48px; justify-content: space-between; }
  .contrato .assinatura { flex:1; text-align:center; border-top:1px solid #333; padding-top:6px; }
  .contrato .destaque { background:#fff8e1; padding:8px 12px; border-left:4px solid #f0a500; margin:12px 0; }
  .contrato small { color:#555; }
</style>`.trim();

const QUALIFICACAO = `
<p><strong>CONTRATADA:</strong> {{contratada_nome}}, inscrita no CNPJ sob o nº {{contratada_cnpj}},
com sede em {{contratada_endereco}}, e-mail {{contratada_email}}, doravante denominada simplesmente
<strong>CONTRATADA</strong>.</p>
<p><strong>CONTRATANTE:</strong> {{cliente_empresa}}, inscrita no CNPJ/CPF sob o nº {{cliente_cnpj}},
com endereço em {{cliente_endereco}} — {{cliente_cidade}}, neste ato representada por {{cliente_nome}},
e-mail {{cliente_email}}, telefone/WhatsApp {{cliente_whatsapp}}, doravante denominada simplesmente
<strong>CONTRATANTE</strong>.</p>
<p>As partes acima qualificadas têm, entre si, justo e contratado o presente instrumento, que se regerá
pelas cláusulas seguintes e pelas condições descritas no presente.</p>`.trim();

const CLAUSULA_LGPD = `
<h2>Proteção de Dados (LGPD)</h2>
<p>As partes comprometem-se a tratar os dados pessoais a que tiverem acesso em conformidade com a
Lei nº 13.709/2018 (LGPD), utilizando-os exclusivamente para a execução deste contrato.</p>
<p>A CONTRATANTE declara estar ciente de que dados cadastrais, de faturamento e de uso da plataforma
serão tratados pela CONTRATADA para fins de prestação do serviço, faturamento, suporte e cumprimento
de obrigações legais, podendo ser armazenados durante a vigência contratual e pelos prazos legais
de guarda após o encerramento.</p>`.trim();

const CLAUSULA_PROPRIEDADE = `
<h2>Propriedade Intelectual e Conteúdo</h2>
<p>A CONTRATANTE declara e garante ser a legítima titular, ou estar devidamente autorizada a utilizar,
todo o conteúdo (imagens, vídeos, textos, marcas, logotipos e demais materiais) que fornecer para
veiculação, responsabilizando-se integral e exclusivamente por eventuais violações de direitos autorais,
de marca, de imagem ou de terceiros, nos termos da Lei nº 9.610/1998.</p>
<p>A CONTRATANTE isenta a CONTRATADA de qualquer responsabilidade, ônus, multa, indenização ou demanda,
judicial ou extrajudicial, decorrente do conteúdo veiculado, obrigando-se a ressarcir a CONTRATADA de
toda e qualquer quantia que esta venha a despender em razão disso, inclusive honorários advocatícios.</p>
<p>A CONTRATADA reserva-se o direito de recusar, suspender ou remover, a seu critério e sem aviso prévio,
conteúdo que repute ilegal, ofensivo, discriminatório, enganoso, que viole direitos de terceiros ou as
normas aplicáveis (CONAR, CDC, ECA), sem que isso gere direito a abatimento, reembolso ou indenização.</p>`.trim();

const CLAUSULA_USO_IMAGEM = `
<h2>Autorização de Uso de Imagem e Marca</h2>
<p>A CONTRATANTE, neste ato, <strong>autoriza expressa, gratuita e irrevogavelmente</strong> a CONTRATADA a
utilizar o nome empresarial, marca, logotipo, fachada, imagens do estabelecimento e das peças
veiculadas para fins de divulgação, portfólio, redes sociais, materiais comerciais, apresentações,
site e mídias digitais da CONTRATADA, por prazo indeterminado, em território nacional e no exterior,
sem que isso gere qualquer direito a remuneração, indenização ou contraprestação.</p>
<p>A presente autorização abrange a reprodução, exibição, comunicação ao público e adaptação para os
fins acima, nos termos dos artigos 18 a 20 do Código Civil e da Lei nº 9.610/1998, podendo ser
revogada apenas mediante notificação escrita com 30 (trinta) dias de antecedência, sem efeito retroativo
sobre o material já produzido ou publicado.</p>`.trim();

const CLAUSULA_LIMITACAO = `
<h2>Limitação de Responsabilidade</h2>
<p>A CONTRATADA empreenderá seus melhores esforços para manter a disponibilidade do serviço, não se
responsabilizando, contudo, por interrupções decorrentes de: (i) falhas de energia elétrica ou de
conexão de internet no local; (ii) caso fortuito ou força maior; (iii) atos de terceiros, furto,
roubo, vandalismo ou sinistro; (iv) manutenções programadas; (v) indisponibilidade de serviços de
terceiros (provedores, CMS, gateways de pagamento).</p>
<p>Em nenhuma hipótese a responsabilidade da CONTRATADA excederá o valor efetivamente pago pela
CONTRATANTE nos 3 (três) meses anteriores ao evento que originou a demanda, ficando expressamente
excluídos lucros cessantes, danos indiretos ou morais.</p>`.trim();

const CLAUSULA_FORO = `
<h2>Disposições Gerais e Foro</h2>
<p>O presente contrato obriga as partes e seus sucessores. A tolerância quanto ao descumprimento de
qualquer cláusula não implica novação ou renúncia. A nulidade de qualquer cláusula não prejudica as
demais. Alterações somente terão validade se formalizadas por escrito (aditivo), inclusive por meio
eletrônico, nos termos da MP 2.200-2/2001 e da Lei nº 14.063/2020.</p>
<p>As partes reconhecem a validade da assinatura eletrônica e do aceite digital (clickwrap), com
registro de data, hora e endereço IP, como prova da manifestação de vontade.</p>
<p>Fica eleito o foro da comarca de <strong>{{foro_comarca}}</strong> para dirimir quaisquer questões
oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>
<p style="margin-top:24px;">{{cliente_cidade}}, {{data_extenso}}.</p>`.trim();

const ASSINATURAS = `
<div class="assinaturas">
  <div class="assinatura">{{contratada_nome}}<br><small>CONTRATADA</small></div>
  <div class="assinatura">{{cliente_empresa}}<br><small>CONTRATANTE — {{cliente_nome}}</small></div>
</div>`.trim();

function envelope(corpo: string): string {
  return `${ESTILO}\n<div class="contrato">\n${corpo}\n</div>`;
}

/* ═══ 1. PUBLICIDADE — anunciante genérico ════════════════════════════════ */

const PUBLICIDADE_GENERICO = envelope(`
<h1>Contrato de Veiculação de Publicidade em Mídia Indoor (DOOH)</h1>
<p style="text-align:center;"><small>Out-of-Home Digital · Three Digital Mídia</small></p>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto</h2>
<p>O presente contrato tem por objeto a veiculação de peças publicitárias da CONTRATANTE na rede de
telas digitais (mídia indoor / DOOH) operada pela CONTRATADA, no plano <strong>{{plano}}</strong>,
contemplando <strong>{{qtd_telas}}</strong> tela(s)/ponto(s) de exibição, conforme grade de programação
e proof-of-play disponibilizados pela CONTRATADA.</p>

<h2>Cláusula 2ª — Preço e Forma de Pagamento</h2>
<p>Pela prestação dos serviços, a CONTRATANTE pagará o valor de {{preco_tela}} por tela/ponto,
totalizando <strong>{{total_mensal}}</strong> por período, com cobrança recorrente via gateway de
pagamento (Mercado Pago / cartão / Pix), na data de vencimento ajustada no ato da contratação.</p>
<div class="destaque"><strong>Inadimplência:</strong> o atraso superior a 5 (cinco) dias autoriza a
suspensão imediata da veiculação, incidindo multa de 2% sobre o valor em aberto, juros de mora de 1% ao
mês e correção monetária pelo IPCA, sem prejuízo de protesto e inscrição em órgãos de proteção ao crédito.</p>

<h2>Cláusula 3ª — Vigência e Renovação</h2>
<p>O contrato vigora por {{vigencia_meses}} mês(es), de {{data_inicio}} a {{data_fim}}, renovando-se
automaticamente por períodos iguais e sucessivos, salvo manifestação em contrário de qualquer das partes
com antecedência mínima de 30 (trinta) dias.</p>

<h2>Cláusula 4ª — Obrigações da CONTRATANTE</h2>
<p>(i) Fornecer o material de veiculação dentro das especificações técnicas e com antecedência mínima de
48 horas; (ii) garantir a regularidade e licitude do conteúdo; (iii) efetuar os pagamentos nas datas
ajustadas; (iv) manter seus dados cadastrais atualizados.</p>

<h2>Cláusula 5ª — Obrigações da CONTRATADA</h2>
<p>(i) Veicular o conteúdo conforme a grade contratada; (ii) disponibilizar relatórios de exibição
(proof-of-play); (iii) prestar suporte em horário comercial; (iv) zelar pela operação da rede de telas.</p>

<h2>Cláusula 6ª — Rescisão</h2>
<p>O contrato poderá ser rescindido: (a) por acordo entre as partes; (b) por descumprimento contratual,
mediante notificação com prazo de 10 dias para purgação da mora; (c) imotivadamente, por qualquer das
partes, mediante aviso prévio de 30 dias. A rescisão pela CONTRATANTE antes do término da vigência mínima,
quando houver, sujeita-a ao pagamento de multa equivalente a [INSERIR — ex.: 30% do valor remanescente].</p>

${CLAUSULA_PROPRIEDADE}
${CLAUSULA_USO_IMAGEM}
${CLAUSULA_LIMITACAO}
${CLAUSULA_LGPD}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 2. NICHO — Supermercado / Atacadão (encarte de totem) ═══════════════ */

const NICHO_SUPERMERCADO = envelope(`
<h1>Contrato de Mídia Indoor — Encarte Digital de Totem (Supermercados e Atacados)</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto</h2>
<p>Veiculação de encarte digital (ofertas, promoções e comunicação visual) da CONTRATANTE em totens
digitais instalados em seu(s) estabelecimento(s), no plano <strong>{{plano}}</strong>, abrangendo
<strong>{{qtd_telas}}</strong> totem(ns), com intercalação entre o encarte do estabelecimento e
anúncios de terceiros, conforme grade de programação da CONTRATADA.</p>

<h2>Cláusula 2ª — Modelo Comercial</h2>
<p>A CONTRATADA poderá comercializar espaços publicitários de terceiros (fornecedores, indústrias,
marcas) nos totens instalados no estabelecimento da CONTRATANTE, sendo a receita de tais anúncios de
titularidade exclusiva da CONTRATADA, salvo modelo de partilha (revenue share) eventualmente ajustado
em aditivo próprio.</p>

<h2>Cláusula 3ª — Preço e Pagamento</h2>
<p>Valor de {{preco_tela}} por totem, totalizando <strong>{{total_mensal}}</strong> por período, com
cobrança recorrente. Aplicam-se as condições de inadimplência da Cláusula de pagamento padrão (multa
de 2%, juros de 1% a.m. e correção pelo IPCA).</p>

<h2>Cláusula 4ª — Atualização de Ofertas</h2>
<p>A CONTRATANTE encaminhará as artes de encarte com antecedência mínima de 48 horas. A CONTRATADA não
se responsabiliza por divergências de preço, erro de informação ou ofertas em desacordo com o CDC
(Lei 8.078/90), cuja exatidão é de responsabilidade exclusiva da CONTRATANTE.</p>

<h2>Cláusula 5ª — Vigência</h2>
<p>Vigência de {{vigencia_meses}} mês(es), de {{data_inicio}} a {{data_fim}}, com renovação automática
por iguais períodos, salvo aviso prévio de 30 dias.</p>

${CLAUSULA_PROPRIEDADE}
${CLAUSULA_USO_IMAGEM}
${CLAUSULA_LIMITACAO}
${CLAUSULA_LGPD}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 3. NICHO — Restaurantes / Food Service ══════════════════════════════ */

const NICHO_FOODSERVICE = envelope(`
<h1>Contrato de Mídia Indoor — Restaurantes, Bares e Food Service</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto</h2>
<p>Veiculação de cardápio digital, comunicação promocional e publicidade em telas instaladas no
estabelecimento da CONTRATANTE, no plano <strong>{{plano}}</strong>, com <strong>{{qtd_telas}}</strong>
tela(s).</p>

<h2>Cláusula 2ª — Conteúdo e Preços do Cardápio</h2>
<p>A CONTRATANTE é a única responsável pela veracidade de itens, preços, fotos e disponibilidade
exibidos. A CONTRATADA atua exclusivamente como meio técnico de exibição, não respondendo por
divergências, erros ou reclamações de consumidores quanto ao conteúdo (CDC, Lei 8.078/90).</p>

<h2>Cláusula 3ª — Preço e Pagamento</h2>
<p>Valor de {{preco_tela}} por tela, totalizando <strong>{{total_mensal}}</strong> por período, com
cobrança recorrente e as condições de inadimplência padrão (multa de 2%, juros de 1% a.m., IPCA).</p>

<h2>Cláusula 4ª — Vigência</h2>
<p>Vigência de {{vigencia_meses}} mês(es), de {{data_inicio}} a {{data_fim}}, renovável automaticamente.</p>

${CLAUSULA_PROPRIEDADE}
${CLAUSULA_USO_IMAGEM}
${CLAUSULA_LIMITACAO}
${CLAUSULA_LGPD}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 4. NICHO — Saúde (Clínicas, Consultórios, Farmácias) ════════════════ */

const NICHO_SAUDE = envelope(`
<h1>Contrato de Mídia Indoor — Saúde (Clínicas, Consultórios e Farmácias)</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto</h2>
<p>Veiculação de conteúdo informativo e publicitário em telas instaladas em ambiente de saúde da
CONTRATANTE, no plano <strong>{{plano}}</strong>, com <strong>{{qtd_telas}}</strong> tela(s).</p>

<div class="destaque"><strong>Conformidade regulatória:</strong> a CONTRATANTE declara que todo conteúdo
de saúde, medicamentos ou procedimentos observará as normas da ANVISA, do Conselho Federal de Medicina
(CFM) e demais conselhos profissionais aplicáveis, sendo de sua responsabilidade exclusiva eventual
infração publicitária na área de saúde.</p>

<h2>Cláusula 2ª — Preço e Pagamento</h2>
<p>Valor de {{preco_tela}} por tela, totalizando <strong>{{total_mensal}}</strong> por período, cobrança
recorrente, condições de inadimplência padrão.</p>

<h2>Cláusula 3ª — Vigência</h2>
<p>Vigência de {{vigencia_meses}} mês(es), de {{data_inicio}} a {{data_fim}}, renovável automaticamente.</p>

${CLAUSULA_PROPRIEDADE}
${CLAUSULA_USO_IMAGEM}
${CLAUSULA_LIMITACAO}
${CLAUSULA_LGPD}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 5. NICHO — Academias / Fitness ══════════════════════════════════════ */

const NICHO_ACADEMIA = envelope(`
<h1>Contrato de Mídia Indoor — Academias e Estúdios Fitness</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto</h2>
<p>Veiculação de comunicação visual, grade de aulas, promoções e publicidade em telas instaladas no
estabelecimento da CONTRATANTE, no plano <strong>{{plano}}</strong>, com <strong>{{qtd_telas}}</strong>
tela(s).</p>

<h2>Cláusula 2ª — Preço e Pagamento</h2>
<p>Valor de {{preco_tela}} por tela, totalizando <strong>{{total_mensal}}</strong> por período, cobrança
recorrente, condições de inadimplência padrão.</p>

<h2>Cláusula 3ª — Vigência</h2>
<p>Vigência de {{vigencia_meses}} mês(es), de {{data_inicio}} a {{data_fim}}, renovável automaticamente.</p>

${CLAUSULA_PROPRIEDADE}
${CLAUSULA_USO_IMAGEM}
${CLAUSULA_LIMITACAO}
${CLAUSULA_LGPD}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 6. PLANO — Ponta de Gôndola (indústria/fornecedor) ══════════════════ */

const PLANO_PONTA_GONDOLA = envelope(`
<h1>Contrato de Mídia Indoor — Ponta de Gôndola Digital</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto</h2>
<p>Veiculação de anúncios da CONTRATANTE (indústria/fornecedor/marca) em telas de ponta de gôndola
sincronizadas, instaladas em pontos de venda parceiros, no plano <strong>{{plano}}</strong>, com
exibição em <strong>{{qtd_telas}}</strong> tela(s), conforme grade e proof-of-play.</p>

<h2>Cláusula 2ª — Sincronização e Exibição</h2>
<p>A CONTRATADA empreenderá esforços técnicos para sincronizar a exibição entre telas do mesmo ponto
de venda, ressalvando que pequenas variações de sincronismo (na ordem de segundos) são inerentes à
tecnologia e não configuram inadimplemento contratual.</p>

<h2>Cláusula 3ª — Preço e Pagamento</h2>
<p>Valor de {{preco_tela}} por tela/ponto, totalizando <strong>{{total_mensal}}</strong> por período,
com cobrança recorrente e condições de inadimplência padrão.</p>

<h2>Cláusula 4ª — Vigência</h2>
<p>Vigência de {{vigencia_meses}} mês(es), de {{data_inicio}} a {{data_fim}}, renovável automaticamente.</p>

${CLAUSULA_PROPRIEDADE}
${CLAUSULA_USO_IMAGEM}
${CLAUSULA_LIMITACAO}
${CLAUSULA_LGPD}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 7. TERMO DE COMODATO / RESPONSABILIDADE DE EQUIPAMENTO ══════════════ */

const TERMO_COMODATO = envelope(`
<h1>Termo de Comodato e Responsabilidade de Equipamento</h1>
<p style="text-align:center;"><small>Cessão de equipamentos em regime de comodato (Arts. 579 a 585 do Código Civil)</small></p>
${QUALIFICACAO}

<h2>Cláusula 1ª — Objeto do Comodato</h2>
<p>A CONTRATADA cede à CONTRATANTE, em regime de <strong>comodato (empréstimo gratuito de uso)</strong>,
os equipamentos descritos no <strong>Anexo I — Inventário</strong>, que permanecem de propriedade
exclusiva e inalienável da CONTRATADA, destinados unicamente à operação do serviço de mídia indoor.</p>

<h2>Cláusula 2ª — Propriedade e Vedações</h2>
<p>Os equipamentos NÃO integram o patrimônio da CONTRATANTE. É <strong>expressamente vedado</strong> à
CONTRATANTE: (i) vender, ceder, emprestar, alugar, penhorar ou dar em garantia; (ii) remover, transferir
de local ou desinstalar sem autorização escrita; (iii) abrir, reparar, modificar, formatar ou instalar
softwares de terceiros; (iv) remover lacres, etiquetas de patrimônio ou QR codes de identificação.</p>

<h2>Cláusula 3ª — Guarda e Conservação</h2>
<p>A CONTRATANTE obriga-se a guardar e conservar os equipamentos como se seus fossem (Art. 582 do Código
Civil), mantendo-os em local seguro, protegido de intempéries, sobrecarga elétrica e acesso indevido,
arcando com energia elétrica e conexão de internet necessárias ao funcionamento.</p>

<div class="destaque"><strong>Responsabilidade por danos:</strong> a CONTRATANTE responde integralmente
por perda, furto, roubo, extravio, dano, avaria, mau uso, negligência, imprudência ou imperícia,
próprios ou de terceiros (clientes, funcionários, prepostos), obrigando-se a <strong>ressarcir a
CONTRATADA pelo valor de reposição</strong> constante do Anexo I, ou pelo custo de reparo, no prazo de
10 (dez) dias a contar da notificação, sob pena das penalidades da Cláusula de inadimplência.</p>

<h2>Cláusula 4ª — Sinistro e Seguro</h2>
<p>Em caso de furto, roubo ou sinistro, a CONTRATANTE deverá lavrar Boletim de Ocorrência e notificar a
CONTRATADA em até 48 horas. A ausência de B.O. ou de comunicação tempestiva não exime a CONTRATANTE do
dever de ressarcimento. Recomenda-se à CONTRATANTE a contratação de seguro próprio.</p>

<h2>Cláusula 5ª — Manutenção e Suporte</h2>
<p>A manutenção corretiva por defeito natural (desgaste de uso normal) é de responsabilidade da
CONTRATADA. A manutenção decorrente de mau uso, dano ou intervenção indevida será cobrada da CONTRATANTE,
conforme orçamento, incluindo peças, mão de obra e deslocamento.</p>

<h2>Cláusula 6ª — Vigência e Devolução</h2>
<p>O comodato vigora enquanto durar o contrato de prestação de serviço. Encerrado o contrato por
qualquer motivo, a CONTRATANTE deverá permitir a retirada dos equipamentos pela CONTRATADA, ou devolvê-los
em até 10 (dez) dias, no mesmo estado em que os recebeu, ressalvado o desgaste natural. A não devolução
ou a recusa de retirada caracteriza <strong>esbulho possessório e apropriação indébita</strong> (Art. 168
do Código Penal), sujeitando a CONTRATANTE às medidas cíveis e criminais cabíveis, além do ressarcimento
do valor de reposição dos equipamentos.</p>

<h2>Anexo I — Inventário dos Equipamentos Cedidos</h2>
{{inventario_equipamentos}}
<p><small>O inventário acima — gerado automaticamente a partir dos equipamentos vinculados a esta
empresa no sistema — é parte integrante e indissociável deste termo. A assinatura confirma o
recebimento dos equipamentos nas condições descritas, bem como a ciência dos valores de reposição.</small></p>

${CLAUSULA_LIMITACAO}
${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 8. ADITIVO CONTRATUAL (genérico) ════════════════════════════════════ */

const ADITIVO_GENERICO = envelope(`
<h1>Termo Aditivo ao Contrato de Mídia Indoor</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Do Contrato Original</h2>
<p>As partes celebraram contrato de prestação de serviço de mídia indoor em [DATA DO CONTRATO ORIGINAL],
ora aditado pelo presente instrumento, que passa a integrá-lo para todos os fins de direito.</p>

<h2>Cláusula 2ª — Das Alterações</h2>
<p>Por este aditivo, as partes ajustam as seguintes alterações:</p>
<table>
  <thead><tr><th>Item</th><th>Antes</th><th>Depois</th></tr></thead>
  <tbody>
    <tr><td>[Ex.: Plano]</td><td>[ ]</td><td>{{plano}}</td></tr>
    <tr><td>[Ex.: Qtd. de telas]</td><td>[ ]</td><td>{{qtd_telas}}</td></tr>
    <tr><td>[Ex.: Valor mensal]</td><td>[ ]</td><td>{{total_mensal}}</td></tr>
    <tr><td>[Ex.: Vigência]</td><td>[ ]</td><td>{{vigencia_meses}} mês(es)</td></tr>
  </tbody>
</table>

<h2>Cláusula 3ª — Ratificação</h2>
<p>Permanecem inalteradas e em pleno vigor todas as demais cláusulas e condições do contrato original
não expressamente modificadas por este aditivo, que a elas se integra.</p>

${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ═══ 9. TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM (avulso) ═══════════════════ */

const TERMO_USO_IMAGEM = envelope(`
<h1>Termo de Autorização de Uso de Imagem, Nome e Marca</h1>
${QUALIFICACAO}

<h2>Cláusula 1ª — Autorização</h2>
<p>A CONTRATANTE autoriza expressa, gratuita, definitiva e irrevogavelmente a CONTRATADA a captar,
utilizar, reproduzir, exibir e divulgar o nome empresarial, marca, logotipo, fachada, ambiente interno,
imagens do estabelecimento e das peças/campanhas veiculadas, para fins de divulgação institucional,
comercial e promocional da CONTRATADA.</p>

<h2>Cláusula 2ª — Abrangência</h2>
<p>A autorização abrange uso em: site, redes sociais, portfólio, apresentações comerciais, materiais
impressos e digitais, anúncios, cases de sucesso e quaisquer mídias, em território nacional e
internacional, por prazo indeterminado, nos termos dos artigos 18 a 20 do Código Civil e da Lei
nº 9.610/1998.</p>

<h2>Cláusula 3ª — Gratuidade</h2>
<p>A presente autorização é concedida a título gratuito, não gerando à CONTRATANTE qualquer direito a
remuneração, royalties ou indenização, presente ou futura.</p>

${CLAUSULA_FORO}
${ASSINATURAS}
`);

/* ─── Catálogo exportado ────────────────────────────────────────────────── */

export const MODELOS_CONTRATO: ModeloContrato[] = [
  { titulo: "Publicidade DOOH — Anunciante (genérico)", conteudo_html: PUBLICIDADE_GENERICO },
  { titulo: "Nicho — Supermercado/Atacadão (Encarte Totem)", conteudo_html: NICHO_SUPERMERCADO },
  { titulo: "Nicho — Restaurantes e Food Service", conteudo_html: NICHO_FOODSERVICE },
  { titulo: "Nicho — Saúde (Clínicas/Farmácias)", conteudo_html: NICHO_SAUDE },
  { titulo: "Nicho — Academias e Fitness", conteudo_html: NICHO_ACADEMIA },
  { titulo: "Plano — Ponta de Gôndola Digital", conteudo_html: PLANO_PONTA_GONDOLA },
  { titulo: "Termo de Comodato e Responsabilidade de Equipamento", conteudo_html: TERMO_COMODATO },
  { titulo: "Aditivo Contratual (genérico)", conteudo_html: ADITIVO_GENERICO },
  { titulo: "Termo de Autorização de Uso de Imagem/Marca", conteudo_html: TERMO_USO_IMAGEM },
];
