/**
 * GET /api/painel/rede/dashboard
 *
 * Métricas consolidadas da rede atual (todas filiais agregadas + breakdown).
 * Disponível pra qualquer usuário com rede_id no painel.
 *
 * Query params:
 *  - periodo: 7d | 30d | mes_atual | mes_anterior (default: 30d)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { scopeAtual } from "@/lib/rede/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "30d";

  try {
    const scope = await scopeAtual(empresaId);
    if (!scope?.rede_id) return badRequest("Empresa não pertence a uma rede");

    // Calcula range de datas
    const hoje = new Date();
    let dataInicio: Date;
    let dataFim = new Date(hoje);
    if (periodo === "7d")            dataInicio = new Date(hoje.getTime() - 7  * 86400000);
    else if (periodo === "mes_atual") {
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    } else if (periodo === "mes_anterior") {
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      dataFim    = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);
    } else                            dataInicio = new Date(hoje.getTime() - 30 * 86400000);

    const ini = dataInicio.toISOString();
    const fim = dataFim.toISOString();

    // 1. Totais agregados da rede
    const totais = await queryOne<{
      total_pedidos: string; total_faturado: string; ticket_medio: string;
      total_clientes: string; total_produtos: string;
    }>(
      `SELECT
         COUNT(p.id)::text                                        AS total_pedidos,
         COALESCE(SUM(p.total), 0)::text                          AS total_faturado,
         CASE WHEN COUNT(p.id) > 0
              THEN ROUND(COALESCE(SUM(p.total), 0) / COUNT(p.id), 2)::text
              ELSE '0' END                                         AS ticket_medio,
         (SELECT COUNT(*)::text FROM clientes
           WHERE rede_id = $1 AND deleted_at IS NULL)              AS total_clientes,
         (SELECT COUNT(*)::text FROM produtos
           WHERE rede_id = $1 AND deleted_at IS NULL)              AS total_produtos
         FROM pedidos p
         JOIN empresas e ON e.id = p.empresa_id
        WHERE e.rede_id = $1 AND p.deleted_at IS NULL
          AND p.status = 'entregue'
          AND p.created_at >= $2 AND p.created_at <= $3`,
      [scope.rede_id, ini, fim]
    );

    // 2. Breakdown por filial
    const filiais = await query<{
      empresa_id: string; nome_fantasia: string; nome_filial: string | null;
      is_matriz: boolean;
      pedidos: string; faturado: string; ticket_medio: string;
    }>(
      `SELECT e.id AS empresa_id, e.nome_fantasia,
              e.nome_filial, COALESCE(e.is_matriz, FALSE) AS is_matriz,
              COUNT(p.id)::text                  AS pedidos,
              COALESCE(SUM(p.total), 0)::text    AS faturado,
              CASE WHEN COUNT(p.id) > 0
                   THEN ROUND(COALESCE(SUM(p.total), 0) / COUNT(p.id), 2)::text
                   ELSE '0' END                  AS ticket_medio
         FROM empresas e
    LEFT JOIN pedidos p
           ON p.empresa_id = e.id
          AND p.status = 'entregue'
          AND p.deleted_at IS NULL
          AND p.created_at >= $2 AND p.created_at <= $3
        WHERE e.rede_id = $1 AND e.deleted_at IS NULL
     GROUP BY e.id, e.nome_fantasia, e.nome_filial, e.is_matriz
     ORDER BY faturado DESC NULLS LAST`,
      [scope.rede_id, ini, fim]
    );

    // 3. Top 10 produtos vendidos na rede
    const topProdutos = await query<{
      produto_id: string; nome: string; qtd: string; faturado: string;
    }>(
      `SELECT pi.produto_id, pi.nome,
              SUM(pi.quantidade)::text                          AS qtd,
              SUM(pi.quantidade * pi.preco_unitario)::text      AS faturado
         FROM pedido_itens pi
         JOIN pedidos p   ON p.id = pi.pedido_id
         JOIN empresas e  ON e.id = p.empresa_id
        WHERE e.rede_id = $1
          AND p.status = 'entregue'
          AND p.deleted_at IS NULL
          AND p.created_at >= $2 AND p.created_at <= $3
     GROUP BY pi.produto_id, pi.nome
     ORDER BY qtd DESC
        LIMIT 10`,
      [scope.rede_id, ini, fim]
    ).catch(() => []);

    // 4. Pedidos por dia (gráfico) — últimos 30 dias
    const porDia = await query<{ dia: string; pedidos: string; faturado: string }>(
      `SELECT TO_CHAR(p.created_at::date, 'YYYY-MM-DD') AS dia,
              COUNT(p.id)::text                          AS pedidos,
              SUM(p.total)::text                         AS faturado
         FROM pedidos p
         JOIN empresas e ON e.id = p.empresa_id
        WHERE e.rede_id = $1 AND p.deleted_at IS NULL
          AND p.status = 'entregue'
          AND p.created_at >= $2 AND p.created_at <= $3
     GROUP BY p.created_at::date
     ORDER BY p.created_at::date ASC`,
      [scope.rede_id, ini, fim]
    ).catch(() => []);

    return ok({
      periodo,
      data_inicio: ini, data_fim: fim,
      totais: {
        total_pedidos:   Number(totais?.total_pedidos ?? 0),
        total_faturado:  Number(totais?.total_faturado ?? 0),
        ticket_medio:    Number(totais?.ticket_medio ?? 0),
        total_clientes:  Number(totais?.total_clientes ?? 0),
        total_produtos:  Number(totais?.total_produtos ?? 0),
      },
      filiais,
      top_produtos: topProdutos,
      por_dia:      porDia,
    });
  } catch (err) {
    console.error("[Rede/Dashboard]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
