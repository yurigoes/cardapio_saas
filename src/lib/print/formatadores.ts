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
function brl(v: number | string | null | undefined): string {
  if (v == null) return "0,00";
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

// ─── Cupom de fechamento de caixa ──────────────────────────────
interface FechamentoCaixa {
  empresa:           string;
  operador_abertura: string | null;
  operador_fechamento: string | null;
  aberto_em:         string;
  fechado_em:        string;
  valor_abertura:    number | string;
  valor_esperado:    number | string;
  valor_fechamento:  number | string;
  diferenca:         number | string;
  reforcos:          number | string;
  sangrias:          number | string;
  esperados_por_forma:  Record<string, number>;
  informados_por_forma: Record<string, number> | null;
  diferencas_por_forma: Record<string, number> | null;
}

const FORMA_LABEL: Record<string, string> = {
  pix: "PIX", dinheiro: "Dinheiro", credito: "Crédito",
  debito: "Débito", vale: "Vale", outro: "Outro",
};

export function formatarFechamentoCaixa(c: FechamentoCaixa): string {
  const out: string[] = [];
  out.push(center(c.empresa.toUpperCase()));
  out.push(line("="));
  out.push(center("FECHAMENTO DE CAIXA"));
  out.push("");
  out.push(`Aberto em:    ${new Date(c.aberto_em).toLocaleString("pt-BR")}`);
  out.push(`Operador:     ${c.operador_abertura ?? "—"}`);
  out.push(`Fechado em:   ${new Date(c.fechado_em).toLocaleString("pt-BR")}`);
  out.push(`Operador:     ${c.operador_fechamento ?? "—"}`);
  out.push(line());

  out.push(row("Abertura",    brl(c.valor_abertura)));
  if (Number(c.reforcos) > 0) out.push(row("Reforços (+)", brl(c.reforcos)));
  if (Number(c.sangrias) > 0) out.push(row("Sangrias (-)", brl(c.sangrias)));
  out.push(line());
  out.push(center("VENDAS POR FORMA"));
  for (const [k, v] of Object.entries(c.esperados_por_forma)) {
    if (v > 0) out.push(row(FORMA_LABEL[k] ?? k, brl(v)));
  }
  out.push(line("="));
  out.push(row("ESPERADO",    brl(c.valor_esperado)));
  out.push(row("CONFERIDO",   brl(c.valor_fechamento)));
  const dif = Number(c.diferenca);
  if (dif !== 0) {
    out.push(row(dif > 0 ? "SOBRA" : "FALTA", brl(Math.abs(dif))));
  }

  if (c.diferencas_por_forma) {
    out.push("");
    out.push(center("DIFERENÇAS"));
    for (const [k, v] of Object.entries(c.diferencas_por_forma)) {
      if (v !== 0) out.push(row(FORMA_LABEL[k] ?? k, brl(v)));
    }
  }

  out.push("");
  out.push("");
  out.push("");
  return out.join("\n");
}

// ─── Cupom de motoboy ──────────────────────────────────────────
interface MotoboyCorrida {
  pedido_numero: number | null;
  cliente_nome:  string | null;
  endereco:      string | null;
  taxa_entrega:  number | string;
  total_pedido:  number | string;
  status:        string;
  hora:          string;
}
interface MotoboyResumo {
  empresa:        string;
  motoboy_nome:   string;
  data:           string;
  total_corridas: number;
  total_taxas:    number | string;
  corridas:       MotoboyCorrida[];
}

export function formatarCupomMotoboySintetico(r: MotoboyResumo): string {
  const out: string[] = [];
  out.push(center(r.empresa.toUpperCase()));
  out.push(line("="));
  out.push(center("RESUMO MOTOBOY"));
  out.push(`Motoboy: ${r.motoboy_nome}`);
  out.push(`Data:    ${r.data}`);
  out.push(line());
  out.push(row("Total corridas",  String(r.total_corridas)));
  out.push(row("Total taxas",     brl(r.total_taxas)));
  out.push("");
  out.push("");
  return out.join("\n");
}

export function formatarCupomMotoboyAnalitico(r: MotoboyResumo): string {
  const out: string[] = [];
  out.push(center(r.empresa.toUpperCase()));
  out.push(line("="));
  out.push(center("DETALHE DE CORRIDAS"));
  out.push(`Motoboy: ${r.motoboy_nome}`);
  out.push(`Data:    ${r.data}`);
  out.push(line());
  for (const c of r.corridas) {
    out.push(`#${c.pedido_numero ?? "?"} ${c.hora}`);
    if (c.cliente_nome) out.push(`  ${c.cliente_nome}`);
    if (c.endereco)     out.push(`  ${c.endereco}`.slice(0, W));
    out.push(row(`  Taxa`, brl(c.taxa_entrega)));
    out.push(row(`  Total`, brl(c.total_pedido)));
    out.push("");
  }
  out.push(line("="));
  out.push(row("TOTAL TAXAS", brl(r.total_taxas)));
  out.push(row("CORRIDAS",    String(r.total_corridas)));
  out.push("");
  out.push("");
  return out.join("\n");
}

