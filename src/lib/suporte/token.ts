/**
 * Geração e validação de chaves do módulo Suporte.
 * Formato: sup_<24 chars random base64url>
 */
import { createHash, randomBytes } from "crypto";

const PREFIX = "sup_";
const BYTES  = 18;  // 24 chars base64url

export interface NewSupportKey {
  raw:    string;   // sup_xxxx — mostrado 1x
  hash:   string;   // sha256(raw) — armazenado
  prefix: string;   // primeiros 12 chars
}

export function generateSupportKey(): NewSupportKey {
  const random = randomBytes(BYTES).toString("base64url");
  const raw    = `${PREFIX}${random}`;
  return {
    raw,
    hash:   sha256(raw),
    prefix: raw.slice(0, 12),
  };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Calcula expira_em a partir de duração */
export function calcularExpiracao(duracao: string): Date | null {
  const now = new Date();
  switch (duracao) {
    case "24h":    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "30d":    return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case "90d":    return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    case "sempre": return null;
    default:       throw new Error(`Duração inválida: ${duracao}`);
  }
}
