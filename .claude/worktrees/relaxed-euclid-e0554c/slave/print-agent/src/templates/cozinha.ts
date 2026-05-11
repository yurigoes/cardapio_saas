/**
 * templates/cozinha.ts — Template de comanda para cozinha/produção
 *
 * Usa fonte grande para melhor legibilidade à distância.
 *
 * Layout:
 *   COZINHA — PEDIDO #NNN
 *   [Hora: HH:MM]
 *   Mesa: X | Cliente: Nome
 *   --------------------------
 *   *** Item 1 x2 ***
 *   *** Item 2 x1 ***
 *     obs: sem cebola
 *   [Corte]
 */

import {
  EscPosLine,
  buildEscPos,
  appendCut,
  buildSeparator,
  formatTime,
} from "./shared";
import { PedidoData } from "./pedido";

export function printCozinha(data: PedidoData, setor = "COZINHA"): Buffer {
  const lines: EscPosLine[] = [];

  // Cabeçalho do setor (fonte grande)
  lines.push({
    text:  `${setor.toUpperCase()} #${String(data.numero).padStart(4, "0")}`,
    align: "center",
    bold:  true,
    large: true,
  });

  lines.push({
    text:  `Hora: ${formatTime()}`,
    align: "center",
    bold:  true,
  });

  lines.push(...buildSeparator());

  // Identificação
  const tipo = ({
    mesa:     "MESA",
    balcao:   "BALCÃO",
    delivery: "DELIVERY",
    totem:    "TOTEM",
  })[data.tipo] ?? data.tipo.toUpperCase();

  lines.push({ text: tipo, align: "center", bold: true });

  if (data.mesa_numero) {
    lines.push({ text: `Mesa: ${data.mesa_numero}`, align: "center", bold: true, large: true });
  }

  if (data.cliente_nome) {
    lines.push({ text: `Cliente: ${data.cliente_nome}`, align: "center" });
  }

  lines.push(...buildSeparator());

  // Itens em destaque (fonte grande para os itens)
  for (const item of data.itens) {
    lines.push({
      text:  `${item.quantidade}x ${item.nome.toUpperCase()}`,
      align: "left",
      bold:  true,
      large: true,
    });

    if (item.observacoes) {
      lines.push({
        text:  `  >> ${item.observacoes}`,
        align: "left",
        bold:  true,
      });
    }
  }

  // Observações gerais
  if (data.observacoes) {
    lines.push(...buildSeparator());
    lines.push({ text: "OBS GERAL:", align: "left", bold: true });
    lines.push({ text: data.observacoes, align: "left", bold: true });
  }

  // Feed final antes do corte
  lines.push({ text: " ", feed: 3 });

  const buffer = buildEscPos(lines);
  return appendCut(buffer);
}
