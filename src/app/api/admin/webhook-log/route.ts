/**
 * GET /api/admin/webhook-log
 *   ?page=1&limit=50&gateway=&resultado=&from=&to=
 *
 * Lista cross-tenant de webhooks recebidos. Apenas master.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount } from "@/lib/db/client";
import { forbidden, serverError, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  const sp        = req.nextUrl.searchParams;
  const page      = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit     = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const gateway   = sp.get("gateway");
  const resultado = sp.get("resultado");
  const from      = sp.get("from");
  const to        = sp.get("to");
  const offset    = (page - 1) * limit;

  const conds: string[] = ["1=1"];
  const vals: unknown[] = [];
  let idx = 1;

  if (gateway)   { conds.push(`w.gateway_slug = $${idx++}`); vals.push(gateway); }
  if (resultado) { conds.push(`w.resultado = $${idx++}`);    vals.push(resultado); }
  if (from)      { conds.push(`w.recebido_em >= $${idx++}::date`); vals.push(from); }
  if (to)        { conds.push(`w.recebido_em < ($${idx++}::date + INTERVAL '1 day')`); vals.push(to); }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query<{
        id: string; gateway_slug: string; evento: string | null;
        recurso_id: string | null; pedido_id: string | null;
        resultado: string; http_status: number | null; mensagem: string | null;
        ip_origem: string | null; recebido_em: string;
        empresa_id: string | null; empresa_nome: string | null;
        pedido_numero: number | null;
      }>(
        `SELECT w.id, w.gateway_slug, w.evento, w.recurso_id, w.pedido_id,
                w.resultado, w.http_status, w.mensagem,
                w.ip_origem::text AS ip_origem, w.recebido_em,
                w.empresa_id, e.nome_fantasia AS empresa_nome,
                p.numero AS pedido_numero
         FROM webhook_log w
         LEFT JOIN empresas e ON e.id = w.empresa_id
         LEFT JOIN pedidos  p ON p.id = w.pedido_id
         WHERE ${where}
         ORDER BY w.recebido_em DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM webhook_log w WHERE ${where}`, vals),
    ]);

    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Admin/WebhookLog]", err);
    return serverError();
  }
}
