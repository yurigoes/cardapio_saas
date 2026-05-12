/**
 * GET /api/admin/metricas
 *
 * Métricas SaaS para o cockpit master: funnel de empresas, MRR/ARR estimado,
 * conversão trial→pagante, churn, crescimento e empresas em risco.
 *
 * Master only.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  try {
    const [
      funnel,
      mrr,
      trialsExpirando,
      conversao,
      churn,
      crescimento30d,
      empresasEmRisco,
      ranking,
    ] = await Promise.all([
      // Funnel — totais por status
      queryOne<{
        total: string; ativas: string; teste: string; suspensas: string; canceladas: string;
      }>(
        `SELECT
           COUNT(*)::text                                              AS total,
           COUNT(*) FILTER (WHERE status = 'ativo')::text              AS ativas,
           COUNT(*) FILTER (WHERE status = 'teste')::text              AS teste,
           COUNT(*) FILTER (WHERE status IN ('suspensa','suspenso'))::text AS suspensas,
           COUNT(*) FILTER (WHERE status = 'cancelada')::text          AS canceladas
         FROM empresas WHERE deleted_at IS NULL`
      ),

      // MRR estimado — soma do preço do plano por empresa ativa
      queryOne<{ mrr: string; empresas_pagantes: string }>(
        `SELECT
           COALESCE(SUM(p.preco), 0)::text AS mrr,
           COUNT(*)::text                  AS empresas_pagantes
         FROM empresas e
         LEFT JOIN planos p ON p.id = e.plano_id
         WHERE e.deleted_at IS NULL
           AND e.status = 'ativo'
           AND p.preco > 0`
      ),

      // Trials que expiram nos próximos 7 dias (ação manual)
      query<{
        id: string; nome_fantasia: string; email: string | null;
        trial_fim: string; dias_restantes: number;
      }>(
        `SELECT id, nome_fantasia, email, trial_fim::text,
                EXTRACT(DAY FROM (trial_fim - NOW()))::int AS dias_restantes
         FROM empresas
         WHERE deleted_at IS NULL
           AND status = 'teste'
           AND trial_fim IS NOT NULL
           AND trial_fim BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         ORDER BY trial_fim ASC
         LIMIT 20`
      ),

      // Conversão últimos 30/60/90 dias (% das que entraram em trial nesse período e hoje estão 'ativo')
      queryOne<{
        c30_total: string; c30_convertidas: string;
        c60_total: string; c60_convertidas: string;
        c90_total: string; c90_convertidas: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text                                  AS c30_total,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND status = 'ativo')::text             AS c30_convertidas,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days')::text                                  AS c60_total,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND status = 'ativo')::text             AS c60_convertidas,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::text                                  AS c90_total,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days' AND status = 'ativo')::text             AS c90_convertidas
         FROM empresas WHERE deleted_at IS NULL`
      ),

      // Churn últimos 30/60/90 — empresas que viraram suspensa/cancelada no período
      // Aproximação: usa updated_at como proxy de quando mudou status
      queryOne<{ ch30: string; ch60: string; ch90: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('suspensa','suspenso','cancelada')
                              AND updated_at >= NOW() - INTERVAL '30 days')::text AS ch30,
           COUNT(*) FILTER (WHERE status IN ('suspensa','suspenso','cancelada')
                              AND updated_at >= NOW() - INTERVAL '60 days')::text AS ch60,
           COUNT(*) FILTER (WHERE status IN ('suspensa','suspenso','cancelada')
                              AND updated_at >= NOW() - INTERVAL '90 days')::text AS ch90
         FROM empresas WHERE deleted_at IS NULL`
      ),

      // Crescimento — novas empresas por dia (últimos 30d)
      query<{ dia: string; novas: string }>(
        `SELECT date_trunc('day', created_at)::date::text AS dia,
                COUNT(*)::text                            AS novas
         FROM empresas
         WHERE deleted_at IS NULL
           AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY dia
         ORDER BY dia ASC`
      ),

      // Empresas em risco — ativas/teste sem pedido nos últimos 7 dias
      query<{
        id: string; nome_fantasia: string; status: string;
        ultimo_pedido: string | null; dias_sem_pedido: number | null;
      }>(
        `SELECT e.id, e.nome_fantasia, e.status,
                MAX(p.created_at)::text AS ultimo_pedido,
                EXTRACT(DAY FROM (NOW() - MAX(p.created_at)))::int AS dias_sem_pedido
         FROM empresas e
         LEFT JOIN pedidos p ON p.empresa_id = e.id AND p.deleted_at IS NULL
         WHERE e.deleted_at IS NULL
           AND e.status IN ('ativo','teste')
           AND e.created_at < NOW() - INTERVAL '7 days'
         GROUP BY e.id
         HAVING MAX(p.created_at) IS NULL OR MAX(p.created_at) < NOW() - INTERVAL '7 days'
         ORDER BY MAX(p.created_at) ASC NULLS FIRST
         LIMIT 10`
      ),

      // Ranking — top 10 empresas por receita nos últimos 30 dias (cross-tenant)
      query<{
        id: string; nome_fantasia: string; status: string;
        pedidos_30d: string; receita_30d: string;
      }>(
        `SELECT e.id, e.nome_fantasia, e.status,
                COUNT(p.id)::text AS pedidos_30d,
                COALESCE(SUM(p.total) FILTER (WHERE p.status NOT IN ('cancelado')), 0)::text AS receita_30d
         FROM empresas e
         LEFT JOIN pedidos p ON p.empresa_id = e.id
                            AND p.deleted_at IS NULL
                            AND p.created_at >= NOW() - INTERVAL '30 days'
         WHERE e.deleted_at IS NULL
         GROUP BY e.id
         ORDER BY receita_30d DESC
         LIMIT 10`
      ),
    ]);

    function pct(num: number, den: number): number {
      return den > 0 ? Math.round((num / den) * 1000) / 10 : 0;
    }

    const c30T = Number(conversao?.c30_total ?? 0);
    const c60T = Number(conversao?.c60_total ?? 0);
    const c90T = Number(conversao?.c90_total ?? 0);

    const mrrNum = Number(mrr?.mrr ?? 0);

    return ok({
      funnel: {
        total:      Number(funnel?.total      ?? 0),
        ativas:     Number(funnel?.ativas     ?? 0),
        teste:      Number(funnel?.teste      ?? 0),
        suspensas:  Number(funnel?.suspensas  ?? 0),
        canceladas: Number(funnel?.canceladas ?? 0),
      },
      financeiro: {
        mrr:               mrrNum,
        arr:               mrrNum * 12,
        empresas_pagantes: Number(mrr?.empresas_pagantes ?? 0),
      },
      conversao: {
        d30: { total: c30T, convertidas: Number(conversao?.c30_convertidas ?? 0), pct: pct(Number(conversao?.c30_convertidas ?? 0), c30T) },
        d60: { total: c60T, convertidas: Number(conversao?.c60_convertidas ?? 0), pct: pct(Number(conversao?.c60_convertidas ?? 0), c60T) },
        d90: { total: c90T, convertidas: Number(conversao?.c90_convertidas ?? 0), pct: pct(Number(conversao?.c90_convertidas ?? 0), c90T) },
      },
      churn: {
        d30: Number(churn?.ch30 ?? 0),
        d60: Number(churn?.ch60 ?? 0),
        d90: Number(churn?.ch90 ?? 0),
      },
      trials_expirando:  trialsExpirando,
      empresas_em_risco: empresasEmRisco.map(e => ({
        ...e,
        dias_sem_pedido: e.dias_sem_pedido ?? null,
      })),
      crescimento: crescimento30d.map(d => ({ dia: d.dia, novas: Number(d.novas) })),
      ranking:    ranking.map(e => ({
        ...e,
        pedidos_30d: Number(e.pedidos_30d),
        receita_30d: Number(e.receita_30d),
      })),
    });
  } catch (err) {
    console.error("[Admin/Metricas]", err);
    return serverError();
  }
}
