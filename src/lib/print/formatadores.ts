/**
 * Formatadores de cupom para texto plano (largura fixa).
 * Agente decide se converte para ESC/POS antes de imprimir.
 */

interface ItemCupom {
  nome: string;
  quantidade: number;
  preco_unitario: number | string;
  observacoes?: string | null;
}

interface PedidoCupom {
  numero: number | null;
  tipo: string;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_endereco?: Record<string, string> | null;
  mesa_numero?: number | null;
  observacoes?: string | null;
  itens: ItemCupom[];
  subtotal: number | string;
  desconto?: number | string;
  taxa_entrega?: number | string;
  total: number | string;
  forma_pagamento?: string | null;
}

const W = 48; // 80mm

function pad(s: string, n: number): string  { return s.length > n ? s.slice(0, n) : s + " ".repeat(n - s.length); }
function center(s: string, n = W): string   { const sp = Math.max(0, Math.floor((n - s.length) / 2)); return " ".repeat(sp) + s; }
function line(c = "-", n = W): string       { return c.repeat(n); }
function row(left: string, right: string, n = W): string {
  const right2 = right.slice(0, n);
  const leftMax = n - right2.length;
  return pad(left.slice(0, leftMax), leftMax) + right2;
}
function brl(v: number | string): string {
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Cupom da cozinha — só itens, sem preço */
export function formatarCozinha(empresa: string, p: PedidoCupom): string {
  const out: string[] = [];
  out.push(center(empresa.toUpperCase()));
  out.push(line("="));
  out.push(`PEDIDO #${p.numero ?? "?"} · ${p.tipo.toUpperCase()}`);
  if (p.mesa_numero)        out.push(`MESA: ${p.mesa_numero}`);
  if (p.cliente_nome)       out.push(`Cliente: ${p.cliente_nome}`);
  out.push(new Date().toLocaleString("pt-BR"));
  out.push(line());
  for (const it of p.itens) {
    out.push(`${it.quantidade}x ${it.nome}`);
    if (it.observacoes) out.push(`   * ${it.observacoes}`);
  }
  if (p.observacoes) {
    out.push(line());
    out.push("OBSERVAÇÕES:");
    out.push(p.observacoes);
  }
  out.push(line("="));
  out.push("");
  out.push("");
  out.push("");
  return out.join("\n");
}

/** Cupom do cliente — completo com preços e total */
export function formatarCupomCliente(empresa: string, p: PedidoCupom): string {
  const out: string[] = [];
  out.push(center(empresa.toUpperCase()));
  out.push(line("="));
  out.push(`Pedido #${p.numero ?? "?"} · ${p.tipo}`);
  if (p.mesa_numero)        out.push(`Mesa: ${p.mesa_numero}`);
  if (p.cliente_nome)       out.push(`Cliente: ${p.cliente_nome}`);
  if (p.cliente_telefone)   out.push(`Tel: ${p.cliente_telefone}`);
  if (p.cliente_endereco?.rua) {
    out.push(`Endereço: ${p.cliente_endereco.rua}, ${p.cliente_endereco.numero ?? "s/n"}`);
    if (p.cliente_endereco.bairro) out.push(`  ${p.cliente_endereco.bairro}`);
  }
  out.push(new Date().toLocaleString("pt-BR"));
  out.push(line());
  for (const it of p.itens) {
    const subt = Number(it.preco_unitario) * it.quantidade;
    out.push(`${it.quantidade}x ${it.nome}`);
    out.push(row(`   ${brl(it.preco_unitario)} cada`, brl(subt)));
    if (it.observacoes) out.push(`   * ${it.observacoes}`);
  }
  out.push(line());
  out.push(row("Subtotal",     brl(p.subtotal)));
  if (Number(p.desconto)     > 0) out.push(row("Desconto",     `-${brl(p.desconto)}`));
  if (Number(p.taxa_entrega) > 0) out.push(row("Taxa entrega", brl(p.taxa_entrega)));
  out.push(line("="));
  out.push(row("TOTAL", brl(p.total)));
  if (p.forma_pagamento) out.push(`Pagamento: ${p.forma_pagamento}`);
  out.push("");
  out.push(center("Obrigado pela preferência!"));
  out.push("");
  out.push("");
  return out.join("\n");
}
