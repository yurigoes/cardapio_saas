/**
 * GET /api/admin/observability
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD&level=&origem=&page=1&limit=100
 *
 * Master only. Lista erros + agregados (top rotas, contagem por hora).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { ok, forbidden, serverError, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const level  = sp.get("level");
  const origem = sp.get("origem");
  const since  = sp.get("since") ?? "24h";   // 24h | 7d | 30d
  const offset = (page - 1) * limit;

  const interval = since === "7d" ? "7 days" : since === "30d" ? "30 days" : "24 hours";

  const conds: string[] = [`created_at >= NOW() - INTERVAL '${interval}'`];
  const vals: unknown[] = [];
  let i = 1;
  if (level)  { conds.push(`level = $${i++}`);  vals.push(level); }
  if (origem) { conds.push(`origem = $${i++}`); vals.push(origem); }
  const where = conds.join(" AND ");

  try {
    const [rows, total, resumo, topRotas, porHora] = await Promise.all([
      query(
        `SELECT id, level, origem, message, rota, metodo,
                user_agent, ip_origem::text AS ip_origem, created_at,
                empresa_id, usuario_id
           FROM error_log WHERE ${where}
           ORDER BY created_at DESC
           LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM error_log WHERE ${where}`, vals),
      queryOne<{ total: string; erros: string; warns: string; clients: string }>(
        `SELECT
           COUNT(*)::text                                  AS total,
           COUNT(*) FILTER (WHERE level = 'error')::text   AS erros,
           COUNT(*) FILTER (WHERE level = 'warn')::text    AS warns,
           COUNT(*) FILTER (WHERE origem = 'client')::text AS clients
         FROM error_log WHERE created_at >= NOW() - INTERVAL '${interval}'`
      ),
      query<{ rota: string; total: string }>(
        `SELECT COALESCE(rota, '(sem rota)') AS rota, COUNT(*)::text AS total
           FROM error_log
          WHERE created_at >= NOW() - INTERVAL '${interval}'
          GROUP BY rota
          ORDER BY total::int DESC
          LIMIT 10`
      ),
      query<{ hora: string; total: string }>(
        `SELECT date_trunc('hour', created_at)::text AS hora, COUNT(*)::text AS total
           FROM error_log
          WHERE created_at >= NOW() - INTERVAL '${interval}'
          GROUP BY hora
          ORDER BY hora ASC`
      ),
    ]);

    return ok({
      ...paginatedOk(rows, total, page, limit).then ? {} : {},
      data: rows,
      meta: { pagination: { total, page, limit } },
      resumo: {
        total:    Number(resumo?.total   ?? 0),
        erros:    Number(resumo?.erros   ?? 0),
        warns:    Number(resumo?.warns   ?? 0),
        clients:  Number(resumo?.clients ?? 0),
      },
      top_rotas: topRotas.map(r => ({ rota: r.rota, total: Number(r.total) })),
      por_hora:  porHora.map(r  => ({ hora: r.hora, total: Number(r.total) })),
    });
  } catch (err) {
    console.error("[Admin/Observability]", err);
    return serverError();
  }
}
