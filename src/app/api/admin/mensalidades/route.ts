/**
 * GET /api/admin/mensalidades?status=&mes=
 * Master only — lista mensalidades de TODAS empresas.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const mes    = url.searchParams.get("mes");        // YYYY-MM

  const where: string[] = ["e.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (status) { params.push(status); where.push(`m.status = $${params.length}`); }
  if (mes)    { params.push(`${mes}-01`); where.push(`m.mes_referencia = $${params.length}::date`); }

  try {
    const rows = await query(
      `SELECT m.id, m.empresa_id, e.nome_fantasia AS empresa_nome, e.email,
              m.mes_referencia::text, m.valor::float, m.vencimento::text, m.status,
              m.pago_em, m.pago_via, m.mp_init_point, p.nome AS plano_nome
         FROM mensalidades m
         JOIN empresas e ON e.id = m.empresa_id
    LEFT JOIN planos p   ON p.id = m.plano_id
        WHERE ${where.join(" AND ")}
        ORDER BY m.mes_referencia DESC, e.nome_fantasia
        LIMIT 500`,
      params
    );

    const totais = await queryOne<{
      total_aberto: string; total_paga: string; total_atrasada: string;
      qtd_aberto: string; qtd_paga: string; qtd_atrasada: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'aberta'    THEN valor END), 0)::text AS total_aberto,
         COALESCE(SUM(CASE WHEN status = 'paga'      THEN valor END), 0)::text AS total_paga,
         COALESCE(SUM(CASE WHEN status = 'atrasada'  THEN valor END), 0)::text AS total_atrasada,
         COUNT(*) FILTER (WHERE status = 'aberta')::text   AS qtd_aberto,
         COUNT(*) FILTER (WHERE status = 'paga')::text     AS qtd_paga,
         COUNT(*) FILTER (WHERE status = 'atrasada')::text AS qtd_atrasada
       FROM mensalidades m
       JOIN empresas e ON e.id = m.empresa_id
       WHERE ${where.join(" AND ")}`,
      params
    );

    return ok({ mensalidades: rows, totais });
  } catch (err) {
    console.error("[Admin/Mensalidades/GET]", err);
    return serverError();
  }
}
