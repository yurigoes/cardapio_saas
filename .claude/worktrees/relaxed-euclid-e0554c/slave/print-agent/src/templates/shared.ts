/**
 * templates/shared.ts — Primitivas ESC/POS compartilhadas
 *
 * Implementação manual dos comandos ESC/POS mais comuns para independência
 * de bibliotecas externas. Compatível com Epson, Bematech, Elgin e similares.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Comandos ESC/POS
// ─────────────────────────────────────────────────────────────────────────────

// Constantes de comando
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

/** Inicializa a impressora (ESC @) */
const CMD_INIT: number[] = [ESC, 0x40];

/** Alinhamento: esquerda, centro, direita (ESC a n) */
const CMD_ALIGN_LEFT:   number[] = [ESC, 0x61, 0x00];
const CMD_ALIGN_CENTER: number[] = [ESC, 0x61, 0x01];
const CMD_ALIGN_RIGHT:  number[] = [ESC, 0x61, 0x02];

/** Negrito: ativar/desativar (ESC E n) */
const CMD_BOLD_ON:  number[] = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF: number[] = [ESC, 0x45, 0x00];

/** Tamanho de fonte: normal e duplo (ESC ! n) */
const CMD_FONT_NORMAL: number[] = [ESC, 0x21, 0x00];
const CMD_FONT_LARGE:  number[] = [ESC, 0x21, 0x30];  // Double height + double width

/** Corte de papel (GS V m) — corte parcial */
const CMD_CUT_PARTIAL: number[] = [GS, 0x56, 0x01];

/** Alimenta N linhas (ESC d n) */
function cmdFeedLines(n: number): number[] {
  return [ESC, 0x64, n];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de linha
// ─────────────────────────────────────────────────────────────────────────────

export type Align = "left" | "center" | "right";

export interface EscPosLine {
  text:    string;
  align?:  Align;
  bold?:   boolean;
  large?:  boolean;
  feed?:   number;   // linhas extras após o texto (default 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Construtor de buffer ESC/POS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constrói um Buffer ESC/POS a partir de uma lista de linhas descritivas.
 */
export function buildEscPos(lines: EscPosLine[]): Buffer {
  const parts: Buffer[] = [];

  // Inicializa a impressora
  parts.push(Buffer.from(CMD_INIT));

  for (const line of lines) {
    // Alinhamento
    const alignCmd = line.align === "center" ? CMD_ALIGN_CENTER
                   : line.align === "right"  ? CMD_ALIGN_RIGHT
                   : CMD_ALIGN_LEFT;
    parts.push(Buffer.from(alignCmd));

    // Negrito
    if (line.bold) parts.push(Buffer.from(CMD_BOLD_ON));

    // Fonte grande
    if (line.large) parts.push(Buffer.from(CMD_FONT_LARGE));

    // Texto + LF
    parts.push(Buffer.from(line.text + "\n", "latin1"));

    // Reset formatação
    if (line.large) parts.push(Buffer.from(CMD_FONT_NORMAL));
    if (line.bold)  parts.push(Buffer.from(CMD_BOLD_OFF));

    // Linhas extras de feed
    if (line.feed && line.feed > 0) {
      parts.push(Buffer.from(cmdFeedLines(line.feed)));
    }
  }

  return Buffer.concat(parts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatação
// ─────────────────────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function formatDateTime(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatTime(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Centraliza texto em uma linha de N colunas (padrão 42 colunas para 80mm) */
export function center(text: string, cols = 42): string {
  if (text.length >= cols) return text.slice(0, cols);
  const pad = Math.floor((cols - text.length) / 2);
  return " ".repeat(pad) + text;
}

/** Formata coluna esquerda + coluna direita em N colunas */
export function columns(left: string, right: string, cols = 42): string {
  const rightPad = cols - right.length;
  const leftTrunc = left.slice(0, rightPad - 1).padEnd(rightPad - 1);
  return leftTrunc + " " + right;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocos comuns reutilizáveis
// ─────────────────────────────────────────────────────────────────────────────

export function buildHeader(empresaNome: string, numero: number): EscPosLine[] {
  return [
    { text: empresaNome.toUpperCase(), align: "center", bold: true },
    { text: `Pedido #${String(numero).padStart(4, "0")}`, align: "center" },
    { text: formatDateTime(), align: "center" },
    { text: "==========================================", align: "left" },
  ];
}

export function buildSeparator(): EscPosLine[] {
  return [
    { text: "------------------------------------------", align: "left" },
  ];
}

export function buildFooter(): EscPosLine[] {
  return [
    { text: "==========================================", align: "left" },
    { text: "Obrigado pela preferencia!", align: "center" },
    { text: " ", feed: 3 },
  ];
}

/** Adiciona o comando de corte ao final do buffer */
export function appendCut(buffer: Buffer): Buffer {
  return Buffer.concat([buffer, Buffer.from(CMD_CUT_PARTIAL)]);
}
