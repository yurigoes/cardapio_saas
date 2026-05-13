/**
 * GET /api/painel/motoboys/[id]/corridas?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Histórico de entregas do motoboy + total a pagar (soma valor_motoboy).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError, badRequest } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const sp   = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to   = sp.get("to");
  if (!from || !to) return badRequest("from e to (YYYY-MM-DD) obrigatórios");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return badRequest("Datas inválidas");
  }

  try {
    const [resumo, corridas] = await Promise.all([
      queryOne<{ qtd: string; total_pagar: string; total_pedidos: string }>(
        `SELECT
           COUNT(*)::text                              AS qtd,
           COALESCE(SUM(valor_motoboy), 0)::text      AS total_pagar,
           COALESCE(SUM(total), 0)::text              AS total_pedidos
         FROM pedidos
         WHERE motoboy_id = $1 AND empresa_id = $2
           AND deleted_at IS NULL
           AND created_at >= $3::date
           AND created_at <  ($4::date + INTERVAL '1 day')`,
        [params.id, empresaId, from, to]
      ),
      query<{
        id: string; numero: number | null; total: string;
        valor_motoboy: string; status: string; status_entrega: string | null;
        cliente_nome: string | null; entregue_em: string | null;
        zona_nome: string | null; criado_em: string;
      }>(
        `SELECT p.id, p.numero, p.total, p.valor_motoboy,
                p.status, p.status_entrega,
                p.cliente_nome,
                p.entregue_em::text,
                z.nome AS zona_nome,
                p.created_at AS criado_em
         FROM pedidos p
         LEFT JOIN zonas_entrega z ON z.id = p.zona_id
         WHERE p.motoboy_id = $1 AND p.empresa_id = $2
           AND p.deleted_at IS NULL
           AND p.created_at >= $3::date
           AND p.created_at <  ($4::date + INTERVAL '1 day')
         ORDER BY p.created_at DESC
         LIMIT 200`,
        [params.id, empresaId, from, to]
      ),
    ]);

    return ok({
      periodo: { from, to },
      resumo: {
        corridas:      Number(resumo?.qtd ?? 0),
        total_pagar:   Number(resumo?.total_pagar ?? 0),
        total_pedidos: Number(resumo?.total_pedidos ?? 0),
      },
      corridas: corridas.map(c => ({
        ...c,
        total:         Number(c.total),
        valor_motoboy: Number(c.valor_motoboy),
      })),
    });
  } catch (err) {
    console.error("[Motoboys/Corridas]", err);
    return serverError();
  }
}
