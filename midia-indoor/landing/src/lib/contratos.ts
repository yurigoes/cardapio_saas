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
  plano?: string; qtd_telas?: number; preco_tela?: number; total_mensal?: number;
}

export interface Contratada {
  contratada_nome: string; contratada_cnpj: string; contratada_email: string; contratada_site: string;
}
const CONTRATADA_ENV: Contratada = {
  contratada_nome:  process.env.CONTRATADA_NOME  ?? "Three Digital",
  contratada_cnpj:  process.env.CONTRATADA_CNPJ  ?? "",
  contratada_email: process.env.CONTRATADA_EMAIL ?? "contato@tthreedigital.com.br",
  contratada_site:  process.env.CONTRATADA_SITE  ?? "https://tthreedigital.com.br",
};

export function renderContrato(html: string, d: DadosContrato, contratada?: Partial<Contratada>): string {
  const CONTRATADA = { ...CONTRATADA_ENV, ...(contratada ?? {}) };
  const hoje = new Date();
  const vars: Record<string, string> = {
    cliente_nome:     d.cliente_nome ?? "",
    cliente_empresa:  d.cliente_empresa ?? "",
    cliente_email:    d.cliente_email ?? "",
    cliente_whatsapp: d.cliente_whatsapp ?? "",
    cliente_cidade:   d.cliente_cidade ?? "",
    plano:            d.plano ?? "",
    qtd_telas:        String(d.qtd_telas ?? ""),
    preco_tela:       d.preco_tela != null ? d.preco_tela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    total_mensal:     d.total_mensal != null ? d.total_mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    data:             hoje.toLocaleDateString("pt-BR"),
    data_extenso:     hoje.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }),
    ...CONTRATADA,
  };
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
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
