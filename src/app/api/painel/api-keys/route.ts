/**
 * GET  /api/painel/api-keys                → lista keys da empresa (sem expor key cheia)
 * POST /api/painel/api-keys                → cria nova key (RETORNA UMA VEZ)
 * Body: { nome, scopes?: ["read"|"write"|"admin"], expira_em? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { gerarApiKey } from "@/lib/auth/api-key";
import { auditLog } from "@/lib/security/audit";

const ALLOWED = ["master", "admin"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, nome, prefix, scopes, ativo,
              ultimo_uso_em, ultimo_uso_ip::text AS ultimo_uso_ip,
              expira_em, created_at
         FROM api_keys
        WHERE empresa_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[ApiKeys/GET]", err);
    return serverError();
  }
}

const createSchema = z.object({
  nome:      z.string().min(1).max(100).trim(),
  scopes:    z.array(z.enum(["read", "write", "admin"])).optional().default(["read"]),
  expira_em: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const { fullKey, prefix, hash } = gerarApiKey();
    const row = await queryOne<{ id: string }>(
      `INSERT INTO api_keys
         (empresa_id, nome, prefix, key_hash, scopes, expira_em, criado_por)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING id`,
      [empresaId, body.nome, prefix, hash, JSON.stringify(body.scopes), body.expira_em ?? null, sub]
    );

    await auditLog({
      acao:       "api_key:criar",
      recurso:    "api_keys",
      recursoId:  row?.id,
      dadosNovos: { nome: body.nome, scopes: body.scopes },
      usuario:    { sub, empresaId },
    });

    return created({
      id:     row?.id,
      nome:   body.nome,
      prefix,
      scopes: body.scopes,
      // ATENÇÃO: key cheia retornada APENAS aqui. Salve agora — não vai poder ver de novo.
      key:    fullKey,
      aviso:  "Esta é a única vez que a key completa é exibida. Salve-a em local seguro.",
    });
  } catch (err) {
    console.error("[ApiKeys/POST]", err);
    return serverError();
  }
}
