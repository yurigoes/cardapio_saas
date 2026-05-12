/**
 * GET /api/admin/dashboard
 *
 * Visão consolidada cross-tenant do dono do SaaS.
 * Acesso restrito a master.
 *
 * Retorna:
 *   - kpis: totais (empresas, usuários, pedidos do mês, receita)
 *   - top_empresas: ranking de 10 empresas por pedidos no mês
 *   - alertas: lista de empresas com problemas (suspensa, expirando, etc)
 *   - atividade: pedidos consolidados por hora (últimas 24h)
 *   - novos_clientes_mes: cadastros do mês inteiro
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
    const [kpis, topEmpresas, alertas, atividade, novosClientes] = await Promise.all([
      // KPIs gerais
      queryOne<{
        total_empresas: string; empresas_ativas: string;
        empresas_novas_mes: string;
        total_usuarios: string;
        pedidos_mes: string; pedidos_hoje: string;
        receita_mes: string; receita_hoje: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM empresas WHERE deleted_at IS NULL)                            AS total_empresas,
           (SELECT COUNT(*) FROM empresas WHERE status = 'ativo' AND deleted_at IS NULL)       AS empresas_ativas,
           (SELECT COUNT(*) FROM empresas WHERE created_at >= date_trunc('month', NOW())
                                            AND deleted_at IS NULL)                            AS empresas_novas_mes,
           (SELECT COUNT(*) FROM usuarios WHERE deleted_at IS NULL)                            AS total_usuarios,
           (SELECT COUNT(*) FROM pedidos  WHERE created_at >= date_trunc('month', NOW())
                                            AND deleted_at IS NULL)                            AS pedidos_mes,
           (SELECT COUNT(*) FROM pedidos  WHERE created_at >= date_trunc('day', NOW())
                                            AND deleted_at IS NULL)                            AS pedidos_hoje,
           (SELECT COALESCE(SUM(valor), 0) FROM pagamentos
              WHERE status = 'aprovado' AND created_at >= date_trunc('month', NOW()))          AS receita_mes,
           (SELECT COALESCE(SUM(valor), 0) FROM pagamentos
              WHERE status = 'aprovado' AND created_at >= date_trunc('day', NOW()))            AS receita_hoje`
      ),

      // Top 10 empresas por pedidos no mês
      query<{
        id: string; nome_fantasia: string; slug: string; status: string;
        pedidos_mes: string; receita_mes: string;
      }>(
        `SELECT e.id, e.nome_fantasia, e.slug, e.status,
                COUNT(p.id) AS pedidos_mes,
                COALESCE(SUM(p.total) FILTER (WHERE p.status NOT IN ('cancelado')), 0) AS receita_mes
         FROM empresas e
         LEFT JOIN pedidos p ON p.empresa_id = e.id
                            AND p.created_at >= date_trunc('month', NOW())
                            AND p.deleted_at IS NULL
         WHERE e.deleted_at IS NULL
         GROUP BY e.id
         ORDER BY pedidos_mes DESC
         LIMIT 10`
      ),

      // Empresas com alertas
      query<{
        id: string; nome_fantasia: string; status: string;
        assinatura_expira_em: string | null;
        dias_para_expirar: number | null;
      }>(
        `SELECT e.id, e.nome_fantasia, e.status,
                e.assinatura_expira_em::text,
                CASE WHEN e.assinatura_expira_em IS NOT NULL
                  THEN EXTRACT(DAY FROM (e.assinatura_expira_em - NOW()))::int
                  ELSE NULL END AS dias_para_expirar
         FROM empresas e
         WHERE e.deleted_at IS NULL
           AND (
             e.status IN ('suspenso', 'bloqueado')
             OR (e.assinatura_expira_em IS NOT NULL
                 AND e.assinatura_expira_em < NOW() + INTERVAL '7 days')
           )
         ORDER BY
           CASE e.status WHEN 'bloqueado' THEN 1 WHEN 'suspenso' THEN 2 ELSE 3 END,
           e.assinatura_expira_em ASC NULLS LAST
         LIMIT 20`
      ),

      // Atividade por hora (últimas 24h, todas empresas)
      query<{ hora: string; total: string }>(
        `SELECT date_trunc('hour', created_at)::text AS hora,
                COUNT(*)::text AS total
         FROM pedidos
         WHERE created_at >= NOW() - INTERVAL '24 hours'
           AND deleted_at IS NULL
         GROUP BY date_trunc('hour', created_at)
         ORDER BY hora ASC`
      ),

      // Novos clientes (cross-tenant) no mês
      queryOne<{ qtd: string }>(
        `SELECT COUNT(*) AS qtd FROM clientes
         WHERE created_at >= date_trunc('month', NOW()) AND deleted_at IS NULL`
      ),
    ]);

    return ok({
      kpis: {
        total_empresas:     Number(kpis?.total_empresas     ?? 0),
        empresas_ativas:    Number(kpis?.empresas_ativas    ?? 0),
        empresas_novas_mes: Number(kpis?.empresas_novas_mes ?? 0),
        total_usuarios:     Number(kpis?.total_usuarios     ?? 0),
        pedidos_mes:        Number(kpis?.pedidos_mes        ?? 0),
        pedidos_hoje:       Number(kpis?.pedidos_hoje       ?? 0),
        receita_mes:        Number(kpis?.receita_mes        ?? 0),
        receita_hoje:       Number(kpis?.receita_hoje       ?? 0),
        novos_clientes_mes: Number(novosClientes?.qtd       ?? 0),
      },
      top_empresas: topEmpresas.map(e => ({
        ...e,
        pedidos_mes: Number(e.pedidos_mes),
        receita_mes: Number(e.receita_mes),
      })),
      alertas,
      atividade: atividade.map(a => ({ hora: a.hora, total: Number(a.total) })),
    });
  } catch (err) {
    console.error("[Admin/Dashboard]", err);
    return serverError();
  }
}
