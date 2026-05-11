/**
 * templates/pedido.ts — Template de comprovante de pedido (cópia do cliente)
 *
 * Layout:
 *   [EMPRESA NOME - centralizado]
 *   [Data/hora]
 *   ===========================
 *   PEDIDO #NNN — TIPO
 *   Mesa: X | Cliente: Nome
 *   ===========================
 *   Item 1 x2          R$ 00,00
 *   Item 2 x1          R$ 00,00
 *   ===========================
 *   TOTAL:             R$ 00,00
 *   ===========================
 *   [Observações se houver]
 *   [Corte]
 */

import {
  EscPosLine,
  buildEscPos,
  appendCut,
  buildHeader,
  buildSeparator,
  buildFooter,
  formatCurrency,
  columns,
} from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de dados do pedido
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemPedidoData {
  nome:           string;
  quantidade:     number;
  preco_unitario: number;
  subtotal:       number;
  observacoes?:   string | null;
}

export interface PedidoData {
  numero:            number;
  tipo:              string;   // "mesa", "balcao", "delivery"
  status:            string;
  mesa_numero?:      number | null;
  cliente_nome?:     string | null;
  cliente_telefone?: string | null;
  subtotal:          number;
  total:             number;
  observacoes?:      string | null;
  itens:             ItemPedidoData[];
  empresaNome:       string;
  created_at?:       string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gerador de buffer
// ─────────────────────────────────────────────────────────────────────────────

export function printPedido(data: PedidoData): Buffer {
  const lines: EscPosLine[] = [];

  // Cabeçalho
  lines.push(...buildHeader(data.empresaNome, data.numero));

  // Tipo e identificação
  const tipoLabel = ({
    mesa:     "MESA",
    balcao:   "BALCÃO",
    delivery: "DELIVERY",
    totem:    "TOTEM",
  })[data.tipo] ?? data.tipo.toUpperCase();

  lines.push({
    text:  `PEDIDO #${String(data.numero).padStart(4, "0")} — ${tipoLabel}`,
    align: "left",
    bold:  true,
  });

  if (data.mesa_numero) {
    lines.push({ text: `Mesa: ${data.mesa_numero}`, align: "left" });
  }

  if (data.cliente_nome) {
    lines.push({ text: `Cliente: ${data.cliente_nome}`, align: "left" });
  }

  if (data.cliente_telefone) {
    lines.push({ text: `Tel: ${data.cliente_telefone}`, align: "left" });
  }

  lines.push(...buildSeparator());

  // Itens
  lines.push({ text: "ITEM                          QTD   VALOR", align: "left", bold: true });
  lines.push(...buildSeparator());

  for (const item of data.itens) {
    // Linha principal do item: nome + subtotal
    const itemLine = columns(
      `${item.nome} x${item.quantidade}`,
      formatCurrency(item.subtotal)
    );
    lines.push({ text: itemLine, align: "left" });

    // Preço unitário (se quantidade > 1)
    if (item.quantidade > 1) {
      lines.push({
        text:  `  (${formatCurrency(item.preco_unitario)} cada)`,
        align: "left",
      });
    }

    // Observação do item
    if (item.observacoes) {
      lines.push({
        text:  `  obs: ${item.observacoes}`,
        align: "left",
      });
    }
  }

  lines.push(...buildSeparator());

  // Subtotal (se diferente do total)
  if (data.subtotal !== data.total) {
    lines.push({
      text:  columns("Subtotal:", formatCurrency(data.subtotal)),
      align: "left",
    });
  }

  // Total
  lines.push({
    text:  columns("TOTAL:", formatCurrency(data.total)),
    align: "left",
    bold:  true,
  });

  // Observações gerais do pedido
  if (data.observacoes) {
    lines.push(...buildSeparator());
    lines.push({ text: "Observacoes:", align: "left", bold: true });
    lines.push({ text: data.observacoes, align: "left" });
  }

  lines.push(...buildFooter());

  const buffer = buildEscPos(lines);
  return appendCut(buffer);
}
