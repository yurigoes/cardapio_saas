/**
 * API key system — autenticação alternativa ao JWT pra integrações externas.
 *
 * Formato: apk_<24 chars random>
 *   - prefix: 'apk_' + primeiros 8 chars (visível ao operador, p/ identificar)
 *   - hash: SHA-256 da key completa (salvo no banco)
 *
 * Uso pelo cliente:
 *   curl -H "Authorization: Bearer apk_abc123..." https://app/api/v1/produtos
 */
import crypto from "crypto";
import { queryOne, query } from "@/lib/db/client";

export interface ApiKeyContext {
  id:         string;
  empresaId:  string;
  nome:       string;
  scopes:     string[];
}

const PREFIX = "apk_";
const KEY_BYTES = 24;     // ~32 chars base64url
const HASH_ALGO = "sha256";

export function gerarApiKey(): { fullKey: string; prefix: string; hash: string } {
  const raw     = crypto.randomBytes(KEY_BYTES).toString("base64url");
  const fullKey = PREFIX + raw;
  const prefix  = fullKey.slice(0, 12);   // 'apk_xxxxxxxx'
  const hash    = crypto.createHash(HASH_ALGO).update(fullKey).digest("hex");
  return { fullKey, prefix, hash };
}

function hashKey(fullKey: string): string {
  return crypto.createHash(HASH_ALGO).update(fullKey).digest("hex");
}

/**
 * Verifica API key no header Authorization e retorna contexto.
 * Retorna null se inválida/inexistente/expirada/desativada.
 * Atualiza ultimo_uso_em/ultimo_uso_ip best-effort.
 */
export async function verifyApiKey(
  authHeader: string | null | undefined,
  ip?: string | null
): Promise<ApiKeyContext | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const fullKey = authHeader.slice(7).trim();
  if (!fullKey.startsWith(PREFIX)) return null;

  const hash = hashKey(fullKey);
  const row = await queryOne<{
    id: string; empresa_id: string; nome: string; scopes: string[] | string;
    expira_em: string | null;
  }>(
    `SELECT id, empresa_id, nome, scopes, expira_em
       FROM api_keys
      WHERE key_hash = $1 AND ativo = true AND deleted_at IS NULL
      LIMIT 1`,
    [hash]
  ).catch(() => null);

  if (!row) return null;
  if (row.expira_em && new Date(row.expira_em) < new Date()) return null;

  // Update best-effort (não bloqueia)
  query(
    `UPDATE api_keys SET ultimo_uso_em = NOW(), ultimo_uso_ip = $2::inet, updated_at = NOW() WHERE id = $1`,
    [row.id, ip ?? null]
  ).catch(() => {});

  const scopes = Array.isArray(row.scopes) ? row.scopes
               : typeof row.scopes === "string" ? JSON.parse(row.scopes)
               : ["read"];

  return {
    id:        row.id,
    empresaId: row.empresa_id,
    nome:      row.nome,
    scopes,
  };
}

/** Verifica se contexto tem o scope necessário */
export function hasScope(ctx: ApiKeyContext | null, required: "read" | "write" | "admin"): boolean {
  if (!ctx) return false;
  if (ctx.scopes.includes("admin")) return true;
  if (required === "read")  return ctx.scopes.includes("read")  || ctx.scopes.includes("write");
  if (required === "write") return ctx.scopes.includes("write");
  return false;
}
