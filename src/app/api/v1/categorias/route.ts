/**
 * GET /api/v1/categorias
 * Auth: Authorization: Bearer apk_xxx
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db/client";
import { verifyApiKey, hasScope } from "@/lib/auth/api-key";
import { ok, unauthorized, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const ip  = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ctx = await verifyApiKey(req.headers.get("authorization"), ip);
  if (!ctx) return unauthorized("API key inválida ou ausente");
  if (!hasScope(ctx, "read")) return forbidden("Scope 'read' necessário");

  try {
    const rows = await query(
      `SELECT id, nome, descricao, ordem, disponivel
         FROM categorias
        WHERE empresa_id = $1 AND deleted_at IS NULL
        ORDER BY ordem, nome`,
      [ctx.empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[V1/Categorias]", err);
    return serverError();
  }
}
