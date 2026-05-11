/**
 * config.ts — Configuração do print-agent
 *
 * Lê variáveis de ambiente e exporta configuração de impressoras.
 */

import * as dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de impressora
// ─────────────────────────────────────────────────────────────────────────────

export interface NetworkPrinter {
  type: "network";
  host: string;
  port: number;
}

export interface UsbPrinter {
  type:      "usb";
  vendorId:  string;   // hex string, ex: "0x04b8"
  productId: string;   // hex string, ex: "0x0e15"
}

export type PrinterConfig = NetworkPrinter | UsbPrinter;

export type Setor = "totem" | "balcao" | "cozinha" | "producao" | "bar";

export interface PrintAgentConfig {
  port:        number;
  printers:    Partial<Record<Setor, PrinterConfig>>;
  empresaNome: string;
  empresaCnpj: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse da configuração de impressoras do env
// ─────────────────────────────────────────────────────────────────────────────

function parsePrinters(): Partial<Record<Setor, PrinterConfig>> {
  const raw = process.env.PRINTERS;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, PrinterConfig>;
    const validSetores: Setor[] = ["totem", "balcao", "cozinha", "producao", "bar"];
    const result: Partial<Record<Setor, PrinterConfig>> = {};

    for (const [setor, cfg] of Object.entries(parsed)) {
      if (validSetores.includes(setor as Setor)) {
        result[setor as Setor] = cfg;
      }
    }

    return result;
  } catch (err) {
    console.error("[Config] Erro ao parsear PRINTERS:", err);
    return {};
  }
}

export const config: PrintAgentConfig = {
  port:        parseInt(process.env.PORT || "3001"),
  printers:    parsePrinters(),
  empresaNome: process.env.EMPRESA_NOME || "Restaurante",
  empresaCnpj: process.env.EMPRESA_CNPJ || "",
};
