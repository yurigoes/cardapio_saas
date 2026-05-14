/**
 * GET /api/admin/usuarios
 *
 * Lista TODOS os usuários do sistema (todas empresas + masters).
 * Master only.
 *
 * Query: ?role=master|admin|... &search=texto &page=1 &limit=50
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
  const role   = sp.get("role");
  const search = sp.get("search");
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const conds: string[] = ["u.deleted_at IS NULL"];
  const vals: unknown[] = [];
  let i = 1;
  if (role)   { conds.push(`u.role = $${i++}`); vals.push(role); }
  if (search) {
    conds.push(`(u.nome ILIKE $${i} OR u.email ILIKE $${i})`);
    vals.push(`%${search}%`);
    i++;
  }
  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT u.id, u.nome, u.email, u.role, u.ativo, u.bloqueado_ate,
                u.tentativas_login, u.ultimo_login, u.created_at,
                u.empresa_id,
                e.nome_fantasia AS empresa_nome,
                e.slug          AS empresa_slug
           FROM usuarios u
           LEFT JOIN empresas e ON e.id = u.empresa_id
          WHERE ${where}
          ORDER BY u.created_at DESC
          LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM usuarios u WHERE ${where}`, vals),
    ]);
    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Admin/Usuarios/GET]", err);
    return serverError();
  }
}
