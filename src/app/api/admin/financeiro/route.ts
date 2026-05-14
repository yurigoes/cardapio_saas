/**
 * GET /api/admin/financeiro
 * Master only. Visão de receita recorrente (MRR) e cobranças.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    // Empresas ativas + valor do plano (MRR estimado)
    const mrr = await queryOne<{ total_empresas: string; mrr: string }>(
      `SELECT COUNT(*)::text AS total_empresas,
              COALESCE(SUM(COALESCE(p.preco_mensal, p.preco, 0)), 0)::text AS mrr
         FROM empresas e
         LEFT JOIN planos p ON p.id = e.plano_id
        WHERE e.deleted_at IS NULL AND e.status IN ('ativo', 'teste')`
    ).catch(() => null);

    // Status breakdown
    const porStatus = await query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n
         FROM empresas
        WHERE deleted_at IS NULL
        GROUP BY status`
    ).catch(() => []);

    // Trials ativos (estão consumindo recursos mas ainda não pagam)
    const trials = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM empresas
        WHERE deleted_at IS NULL
          AND status = 'teste'
          AND assinatura_expira_em > NOW()`
    ).catch(() => null);

    // Compras de módulos pagos no mês
    const compras = await queryOne<{ total: string; pago: string; valor: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'pago')::text AS pago,
              COALESCE(SUM(valor) FILTER (WHERE status = 'pago' AND pago_em > NOW() - INTERVAL '30 days'), 0)::text AS valor
         FROM modulo_compras`
    ).catch(() => null);

    // Empresas que vencem em 7 dias
    const vencendo = await query<{ id: string; nome_fantasia: string; assinatura_expira_em: string }>(
      `SELECT id, nome_fantasia, assinatura_expira_em
         FROM empresas
        WHERE deleted_at IS NULL
          AND assinatura_expira_em IS NOT NULL
          AND assinatura_expira_em BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        ORDER BY assinatura_expira_em ASC
        LIMIT 50`
    ).catch(() => []);

    return ok({
      mrr_estimado:        Number(mrr?.mrr ?? 0),
      total_empresas_ativas: Number(mrr?.total_empresas ?? 0),
      por_status:          porStatus.map(s => ({ status: s.status, total: Number(s.n) })),
      trials_ativos:       Number(trials?.total ?? 0),
      compras_modulos: {
        total_30d: Number(compras?.total ?? 0),
        pago_30d:  Number(compras?.pago ?? 0),
        valor_30d: Number(compras?.valor ?? 0),
      },
      vencendo_7d: vencendo,
    });
  } catch (err) {
    console.error("[Admin/Financeiro]", err);
    return serverError();
  }
}
