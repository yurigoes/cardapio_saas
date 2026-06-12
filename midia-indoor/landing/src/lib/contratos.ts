/**
 * Renderização de contratos (HTML com placeholders {{...}}) + hash.
 *
 * Placeholders disponíveis:
 *   Contratante (cliente):  {{cliente_nome}} {{cliente_empresa}} {{cliente_email}}
 *                           {{cliente_whatsapp}} {{cliente_cidade}}
 *   Assinatura:             {{plano}} {{qtd_telas}} {{preco_tela}} {{total_mensal}}
 *   Contratada (Three):     {{contratada_nome}} {{contratada_cnpj}} {{contratada_email}} {{contratada_site}}
 *   Datas:                  {{data_extenso}} {{data}}
 */
import crypto from "crypto";

export interface DadosContrato {
  cliente_nome: string; cliente_empresa: string; cliente_email: string;
  cliente_whatsapp?: string | null; cliente_cidade?: string | null;
  cliente_cnpj?: string | null; cliente_endereco?: string | null;
  plano?: string; qtd_telas?: number; preco_tela?: number; total_mensal?: number;
  vigencia_meses?: number; data_inicio?: string | null; data_fim?: string | null;
  foro_comarca?: string | null;
}

export interface Contratada {
  contratada_nome: string; contratada_cnpj: string; contratada_email: string; contratada_site: string;
  contratada_endereco?: string; contratada_foro?: string;
}
const CONTRATADA_ENV: Contratada = {
  contratada_nome:  process.env.CONTRATADA_NOME  ?? "Three Digital",
  contratada_cnpj:  process.env.CONTRATADA_CNPJ  ?? "",
  contratada_email: process.env.CONTRATADA_EMAIL ?? "contato@tthreedigital.com.br",
  contratada_site:  process.env.CONTRATADA_SITE  ?? "https://tthreedigital.com.br",
  contratada_endereco: process.env.CONTRATADA_ENDERECO ?? "",
  contratada_foro:  process.env.CONTRATADA_FORO  ?? "Salvador/BA",
};

export function renderContrato(html: string, d: DadosContrato, contratada?: Partial<Contratada>, extras?: Record<string, string>): string {
  const CONTRATADA = { ...CONTRATADA_ENV, ...(contratada ?? {}) };
  const hoje = new Date();
  const fmtData = (s?: string | null) => {
    if (!s) return "";
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? String(s) : dt.toLocaleDateString("pt-BR");
  };
  const vars: Record<string, string> = {
    cliente_nome:      d.cliente_nome ?? "",
    cliente_empresa:   d.cliente_empresa ?? "",
    cliente_email:     d.cliente_email ?? "",
    cliente_whatsapp:  d.cliente_whatsapp ?? "",
    cliente_cidade:    d.cliente_cidade ?? "",
    cliente_cnpj:      d.cliente_cnpj ?? "",
    cliente_endereco:  d.cliente_endereco ?? "",
    plano:             d.plano ?? "",
    qtd_telas:         String(d.qtd_telas ?? ""),
    preco_tela:        d.preco_tela != null ? d.preco_tela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    total_mensal:      d.total_mensal != null ? d.total_mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    vigencia_meses:    String(d.vigencia_meses ?? ""),
    data_inicio:       fmtData(d.data_inicio),
    data_fim:          fmtData(d.data_fim),
    foro_comarca:      d.foro_comarca ?? CONTRATADA.contratada_foro ?? "",
    data:              hoje.toLocaleDateString("pt-BR"),
    data_extenso:      hoje.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }),
    ...CONTRATADA,
    ...(extras ?? {}),
  };
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

/** Item de inventario pra montar a tabela de comodato. */
export interface EquipamentoComodato {
  tipo: string; nome: string; fabricante?: string | null; modelo?: string | null;
  serial?: string | null; mac?: string | null; valor?: number | null;
  local_nome?: string | null; vinculado_nome?: string | null;
}

const LABEL_TIPO_EQUIP: Record<string, string> = {
  box: "Android Box", tv: "TV/Monitor", "tv-box": "TV-Box", totem: "Totem",
  cabo: "Cabo", fonte: "Fonte", suporte: "Suporte", outro: "Item",
};

/** Monta o HTML da tabela de equipamentos cedidos (Anexo I do comodato). */
export function montarTabelaEquipamentos(itens: EquipamentoComodato[]): string {
  if (!itens.length) {
    return `<p style="color:#a00;"><em>Nenhum equipamento vinculado a esta empresa. Vincule os equipamentos no Inventário antes de gerar o termo.</em></p>`;
  }
  const fmtV = (v?: number | null) => v != null && v > 0 ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  let total = 0;
  const linhas = itens.map((it, i) => {
    if (it.valor && it.valor > 0) total += it.valor;
    const tipoLabel = LABEL_TIPO_EQUIP[it.tipo] ?? it.tipo;
    const marcaModelo = [it.fabricante, it.modelo].filter(Boolean).join(" ") || "—";
    return `<tr>
      <td>${i + 1}</td>
      <td>${tipoLabel}${it.nome ? ` — ${it.nome}` : ""}</td>
      <td>${marcaModelo}</td>
      <td>${it.serial || "—"}</td>
      <td>${it.mac || "—"}</td>
      <td>${it.local_nome || "—"}</td>
      <td>${fmtV(it.valor)}</td>
    </tr>`;
  }).join("\n");
  return `<table>
  <thead><tr><th>#</th><th>Equipamento</th><th>Marca/Modelo</th><th>Nº de Série</th><th>MAC/ID</th><th>Local de Instalação</th><th>Valor de Reposição</th></tr></thead>
  <tbody>
    ${linhas}
    <tr><td colspan="6" style="text-align:right;"><strong>VALOR TOTAL DE REPOSIÇÃO</strong></td><td><strong>${total > 0 ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</strong></td></tr>
  </tbody>
</table>`;
}

export function hashConteudo(html: string): string {
  return crypto.createHash("sha256").update(html, "utf8").digest("hex");
}

/** Modelo padrão de contrato (seed/sugestão pro master editar). */
export const TEMPLATE_PADRAO = `
<h1 style="text-align:center;">Contrato de Prestação de Serviço — Mídia Indoor</h1>
<p><strong>CONTRATADA:</strong> {{contratada_nome}}{{contratada_cnpj}}, e-mail {{contratada_email}}.</p>
<p><strong>CONTRATANTE:</strong> {{cliente_empresa}}, representada por {{cliente_nome}}, e-mail {{cliente_email}}{{cliente_whatsapp}}.</p>
<h3>1. Objeto</h3>
<p>Prestação de serviço de mídia indoor (sinalização digital), incluindo gerenciamento de
conteúdo e telas, no plano <strong>{{plano}}</strong>, com <strong>{{qtd_telas}}</strong> tela(s),
ao valor de {{preco_tela}} por tela, totalizando <strong>{{total_mensal}}</strong> mensais.</p>
<h3>2. Vigência e pagamento</h3>
<p>Contrato mensal, renovado automaticamente, com cobrança recorrente via Mercado Pago.
O CONTRATANTE pode cancelar a qualquer momento, sem multa.</p>
<h3>3. Responsabilidades</h3>
<p>O CONTRATANTE é responsável pelo conteúdo enviado. A CONTRATADA garante disponibilidade
do serviço e suporte por WhatsApp em horário comercial.</p>
<h3>4. Foro</h3>
<p>Fica eleito o foro da comarca da CONTRATADA para dirimir questões deste contrato.</p>
<p style="margin-top:32px;">{{data_extenso}}.</p>
`.trim();
