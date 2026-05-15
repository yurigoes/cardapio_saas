/**
 * Helpers pra geração e validação de tokens de agente.
 *
 * Token: rdt_<32 chars random>
 *   - Mostrado uma única vez no momento do registro
 *   - Armazenado como sha256 no banco (não recuperável)
 *   - Validado por hash comparison
 */
import { createHash, randomBytes } from "crypto";

const PREFIX = "rdt_"; // "retaguarda token"
const TOKEN_RANDOM_BYTES = 24; // base64url ≈ 32 chars

export interface NewAgentToken {
  raw:    string;   // token completo "rdt_..." — mostrar 1x ao usuário
  hash:   string;   // sha256(raw) — armazenar em token_hash
  prefix: string;   // 8 chars iniciais do raw — armazenar em token_prefix
}

/** Gera novo token e retorna raw + hash + prefix. */
export function generateAgentToken(): NewAgentToken {
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
  const raw    = `${PREFIX}${random}`;
  const hash   = sha256(raw);
  const prefix = raw.slice(0, 12);   // "rdt_xxxxxxxx"
  return { raw, hash, prefix };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Extrai token do header Authorization: Bearer <token>  */
export function extractAgentToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(rdt_[A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : null;
}
