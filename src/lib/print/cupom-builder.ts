/**
 * cupom-builder.ts — Monta cupom de cliente em ESC/POS com logo + QR
 * Usado pelo dispatch quando empresa tem logo_url configurada.
 */
import { EscposBuilder } from "./escpos";

export interface CupomData {
  empresa: {
    nome:      string;
    cnpj:      string | null;
    logo_url:  string | null;
    whatsapp:  string | null;
  };
  pedido: {
    id:               string;
    numero:           number | null;
    tipo:             string;
    cliente_nome:     string | null;
    cliente_telefone: string | null;
    cliente_endereco: { rua?: string; numero?: string; bairro?: string; cidade?: string } | null;
    mesa_numero:      number | null;
    observacoes:      string | null;
    forma_pagamento:  string | null;
    subtotal:         number | string;
    desconto:         number | string;
    taxa_entrega:     number | string;
    total:            number | string;
    itens: Array<{
      nome:           string;
      quantidade:     number;
      preco_unitario: number | string;
      observacoes?:   string | null;
    }>;
  };
  baseUrl: string;     // ex: https://app.tthreedigital.com.br (pra montar QR)
}

function brl(v: number | string | null | undefined): string {
  if (v == null) return "R$ 0,00";
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

const TIPO_LABEL: Record<string, string> = {
  mesa:     "MESA",
  balcao:   "BALCAO",
  delivery: "DELIVERY",
  totem:    "AUTOATENDIMENTO",
  whatsapp: "WHATSAPP",
  app:      "APP",
};

export async function buildCupomClienteEscpos(d: CupomData): Promise<string> {
  const b = new EscposBuilder({ widthChars: 48 });
  const p = d.pedido;
  const e = d.empresa;

  // ─── Cabeçalho com logo ───
  b.alignCenter();
  if (e.logo_url) {
    await b.logoFromUrl(e.logo_url, 320);
    b.feed(1);
  }
  b.bold().size(true).text(e.nome).size(false).bold(false);
  if (e.cnpj) b.text(`CNPJ ${e.cnpj}`);
  if (e.whatsapp) b.text(`WhatsApp ${e.whatsapp}`);
  b.hr("=");

  b.bold().text("CUPOM NAO-FISCAL").bold(false);

  // ─── Pedido info ───
  b.alignLeft().feed(1);
  b.bold().text(`PEDIDO #${p.numero ?? "?"}`).bold(false);
  b.text(`Tipo: ${TIPO_LABEL[p.tipo] ?? p.tipo.toUpperCase()}`);
  if (p.mesa_numero)        b.text(`Mesa: ${p.mesa_numero}`);
  if (p.cliente_nome)       b.text(`Cliente: ${p.cliente_nome}`);
  if (p.cliente_telefone)   b.text(`Tel: ${p.cliente_telefone}`);
  if (p.cliente_endereco?.rua) {
    b.text(`Endereco: ${p.cliente_endereco.rua}, ${p.cliente_endereco.numero ?? "s/n"}`);
    if (p.cliente_endereco.bairro) b.text(`  ${p.cliente_endereco.bairro}`);
  }
  b.text(new Date().toLocaleString("pt-BR"));
  b.hr();

  // ─── Itens ───
  for (const it of p.itens) {
    const subt = Number(it.preco_unitario) * it.quantidade;
    b.text(`${it.quantidade}x ${it.nome}`);
    b.row(`   ${brl(it.preco_unitario)} cada`, brl(subt));
    if (it.observacoes) b.text(`   * ${it.observacoes}`);
  }
  b.hr();

  // ─── Totais ───
  b.row("Subtotal", brl(p.subtotal));
  if (Number(p.desconto)     > 0) b.row("Desconto",     `-${brl(p.desconto)}`);
  if (Number(p.taxa_entrega) > 0) b.row("Taxa entrega", brl(p.taxa_entrega));
  b.hr("=");
  b.bold().size(true).row("TOTAL", brl(p.total)).size(false).bold(false);
  if (p.forma_pagamento) b.text(`Pagamento: ${p.forma_pagamento}`);

  if (p.observacoes) {
    b.feed(1).bold().text("Observacoes:").bold(false);
    b.text(p.observacoes);
  }

  // ─── QR de acompanhamento ───
  b.feed(1).alignCenter();
  b.bold().text("ACOMPANHE SEU PEDIDO").bold(false);
  await b.qr(`${d.baseUrl}/p/${p.id}`, 240);
  b.text(`${d.baseUrl}/p/${p.id.slice(0, 8)}...`);

  // ─── Footer ───
  b.feed(1);
  b.text("Obrigado pela preferencia!");
  b.cut();

  return b.toBase64();
}
