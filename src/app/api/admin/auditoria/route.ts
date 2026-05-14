/**
 * GET /api/admin/auditoria
 * Master only. Lista audit_log cross-empresa.
 *
 * Query: ?empresa_id, ?acao, ?since=24h|7d|30d, ?page, ?limit
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount } from "@/lib/db/client";
import { ok, forbidden, serverError, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const sp = req.nextUrl.searchParams;
  const empresaId = sp.get("empresa_id");
  const acao      = sp.get("acao");
  const since     = sp.get("since") ?? "7d";
  const page      = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit     = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const offset    = (page - 1) * limit;

  const interval = since === "30d" ? "30 days" : since === "24h" ? "24 hours" : "7 days";

  const conds: string[] = [`a.created_at >= NOW() - INTERVAL '${interval}'`];
  const vals: unknown[] = [];
  let i = 1;
  if (empresaId) { conds.push(`a.empresa_id = $${i++}`); vals.push(empresaId); }
  if (acao)      { conds.push(`a.acao ILIKE $${i++}`);   vals.push(`%${acao}%`); }
  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT a.id, a.acao, a.recurso, a.recurso_id, a.dados_anteriores,
                a.dados_novos, a.ip_address::text AS ip_address, a.created_at,
                a.usuario_id, a.empresa_id,
                u.nome AS usuario_nome, u.email AS usuario_email,
                e.nome_fantasia AS empresa_nome
           FROM audit_log a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           LEFT JOIN empresas e ON e.id = a.empresa_id
          WHERE ${where}
          ORDER BY a.created_at DESC
          LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ).catch(() => []),
      queryCount(`SELECT COUNT(*) FROM audit_log a WHERE ${where}`, vals).catch(() => 0),
    ]);
    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Admin/Auditoria/GET]", err);
    return serverError();
  }
}
