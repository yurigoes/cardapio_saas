/**
 * sync/auth.ts — Autenticação e criptografia para sincronização master-slave
 *
 * Fluxo:
 *  1. Slave faz POST /api/sync/token com { cnpj, slave_key }
 *  2. VPS valida e retorna slaveJWT (role='slave', exp=30d)
 *  3. Slave inclui o JWT em Authorization: Bearer <token>
 *  4. Cada request também inclui X-Slave-Sig: HMAC-SHA256(body, slave_key)
 */

import crypto from "crypto";
import { SignJWT, jwtVerify, JWTPayload } from "jose";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface SlaveTokenPayload extends JWTPayload {
  sub:       string;   // empresa_id
  slug:      string;   // slug da empresa
  role:      "slave";
  empresaId: string;   // igual a sub, para compatibilidade
}

// ─────────────────────────────────────────────────────────────────────────────
// Funções de chave
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera uma nova slave_key aleatória de 64 caracteres hex (256 bits de entropia).
 */
export function generateSlaveKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC-SHA256
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assina um payload (string) com HMAC-SHA256 usando a slave_key.
 * Usado pelo slave para assinar o body de cada request.
 */
export function signPayload(body: string, slaveKey: string): string {
  return crypto
    .createHmac("sha256", slaveKey)
    .update(body, "utf8")
    .digest("hex");
}

/**
 * Verifica se a assinatura HMAC-SHA256 é válida.
 * Usa comparação timing-safe para evitar timing attacks.
 */
export function verifyPayload(body: string, sig: string, slaveKey: string): boolean {
  const expected = signPayload(body, slaveKey);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    // Se os buffers tiverem tamanhos diferentes, timingSafeEqual lança
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT do Slave
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o secret para JWTs de slave.
 * Usa SLAVE_JWT_SECRET se definido, senão JWT_SECRET + '_slave'.
 */
function getSlaveSecret(): Uint8Array {
  const secret =
    process.env.SLAVE_JWT_SECRET ||
    (process.env.JWT_SECRET ? process.env.JWT_SECRET + "_slave" : null);

  if (!secret) {
    throw new Error("SLAVE_JWT_SECRET ou JWT_SECRET deve estar definido");
  }

  return new TextEncoder().encode(secret);
}

/**
 * Cria um JWT de longa duração (30 dias) para autenticar o slave.
 * O slave usa este token em todos os requests às rotas /api/sync/*.
 */
export async function createSlaveJWT(empresaId: string, slug: string): Promise<string> {
  const payload: Omit<SlaveTokenPayload, "iat" | "exp"> = {
    sub:       empresaId,
    slug,
    role:      "slave",
    empresaId,
  };

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .setIssuer("cardapio-saas")
    .setAudience("cardapio-slave")
    .sign(getSlaveSecret());
}

/**
 * Verifica e decodifica um slave JWT.
 * Lança erro se inválido ou expirado.
 */
export async function verifySlaveJWT(token: string): Promise<SlaveTokenPayload> {
  const { payload } = await jwtVerify(token, getSlaveSecret(), {
    issuer:   "cardapio-saas",
    audience: "cardapio-slave",
  });

  const p = payload as SlaveTokenPayload;

  if (p.role !== "slave") {
    throw new Error("Token não é de slave");
  }

  return p;
}

/**
 * Extrai o token Bearer do header Authorization.
 */
export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}
