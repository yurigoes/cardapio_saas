/**
 * GET /api/painel/pagamentos
 *   ?page=1&limit=50&status=&gateway=&from=&to=
 *
 * Lista paginada de pagamentos com pedido associado.
 * Permite reconciliar/auditar cobranças online de todos os gateways.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { forbidden, serverError, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "financeiro:ver")) return forbidden();

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const status = sp.get("status");
  const gateway = sp.get("gateway");
  const from   = sp.get("from");
  const to     = sp.get("to");
  const offset = (page - 1) * limit;

  const conds: string[] = ["p.empresa_id = $1"];
  const vals: unknown[] = [empresaId];
  let idx = 2;

  if (status)  { conds.push(`p.status = $${idx++}`);       vals.push(status); }
  if (gateway) { conds.push(`p.gateway_slug = $${idx++}`); vals.push(gateway); }
  if (from)    { conds.push(`p.created_at >= $${idx++}::date`); vals.push(from); }
  if (to)      { conds.push(`p.created_at < ($${idx++}::date + INTERVAL '1 day')`); vals.push(to); }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query<{
        id: string; gateway_slug: string; gateway_id: string;
        metodo: string; status: string; valor: string;
        gateway_data: Record<string, unknown> | null;
        created_at: string; updated_at: string;
        pedido_id: string | null;
        pedido_numero: number | null;
        pedido_total: string | null;
        pedido_status: string | null;
        cliente_nome: string | null;
      }>(
        `SELECT p.id, p.gateway_slug, p.gateway_id, p.metodo, p.status, p.valor,
                p.gateway_data, p.created_at, p.updated_at,
                p.pedido_id,
                ped.numero  AS pedido_numero,
                ped.total   AS pedido_total,
                ped.status  AS pedido_status,
                ped.cliente_nome
         FROM pagamentos p
         LEFT JOIN pedidos ped ON ped.id = p.pedido_id
         WHERE ${where}
         ORDER BY p.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM pagamentos p WHERE ${where}`, vals),
    ]);

    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Pagamentos/GET]", err);
    return serverError();
  }
}
