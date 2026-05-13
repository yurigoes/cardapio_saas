/**
 * GET /api/v1/produtos
 *
 * Endpoint público da API v1 — autenticado via API key.
 * Lista produtos da empresa autenticada.
 *
 * Headers:
 *   Authorization: Bearer apk_xxxxxx
 *
 * Query: ?categoria_id=&disponivel=true&q=&page=1&limit=50
 */
import { NextRequest } from "next/server";
import { query, queryCount } from "@/lib/db/client";
import { verifyApiKey, hasScope } from "@/lib/auth/api-key";
import { ok, unauthorized, forbidden, paginatedOk, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const ip  = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ctx = await verifyApiKey(req.headers.get("authorization"), ip);
  if (!ctx) return unauthorized("API key inválida ou ausente");
  if (!hasScope(ctx, "read")) return forbidden("Scope 'read' necessário");

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const cat    = sp.get("categoria_id");
  const disp   = sp.get("disponivel");
  const q      = sp.get("q");
  const offset = (page - 1) * limit;

  const conds: string[] = ["empresa_id = $1", "deleted_at IS NULL"];
  const vals: unknown[] = [ctx.empresaId];
  let i = 2;

  if (cat)              { conds.push(`categoria_id = $${i++}`); vals.push(cat); }
  if (disp === "true")  { conds.push(`disponivel = true`); }
  if (disp === "false") { conds.push(`disponivel = false`); }
  if (q)                { conds.push(`(nome ILIKE $${i} OR descricao ILIKE $${i})`); vals.push(`%${q}%`); i++; }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, categoria_id, nome, descricao, preco, imagem_url, tipo,
                disponivel, destaque, tempo_preparo
           FROM produtos WHERE ${where}
           ORDER BY nome ASC
           LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM produtos WHERE ${where}`, vals),
    ]);
    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[V1/Produtos]", err);
    return serverError();
  }
}
