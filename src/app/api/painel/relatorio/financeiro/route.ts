/**
 * GET /api/painel/relatorio/financeiro?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Agrega tudo no servidor para o dashboard financeiro:
 *   - KPIs do período
 *   - Vendas por forma de pagamento (do caixa, fonte de verdade)
 *   - Vendas por tipo de pedido (mesa/balcão/delivery/totem)
 *   - Distribuição por hora do dia (gráfico de pico)
 *   - Caixas no período (count, diferenças)
 *   - Top 5 produtos
 *   - Top 5 clientes
 *
 * Defaults: from/to = hoje
 *
 * Considera apenas pedidos NÃO cancelados na contagem de receita.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, serverError } from "@/lib/utils/response";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "financeiro:ver")) return forbidden();

  const sp   = req.nextUrl.searchParams;
  const from = sp.get("from") ?? todayISO();
  const to   = sp.get("to")   ?? todayISO();

  // Validação básica de datas (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return forbidden("Datas inválidas (esperado YYYY-MM-DD)");
  }

  // Filtro de período: from 00:00 até to+1day 00:00 (intervalo aberto à direita)
  const dateFilter = `created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')`;
  const baseParams = [empresaId, from, to];

  try {
    const [
      kpisRow,
      porForma,
      porTipo,
      porHora,
      caixasInfo,
      topProdutos,
      topClientes,
    ] = await Promise.all([
      // KPIs gerais
      queryOne<{
        total_pedidos:    string;
        total_vendas:     string;
        ticket_medio:     string;
        total_descontos:  string;
        total_estornos:   string;
        clientes_unicos:  string;
      }>(
        `SELECT
           COUNT(*)::text                                 AS total_pedidos,
           COALESCE(SUM(total),    0)::text               AS total_vendas,
           COALESCE(AVG(total),    0)::text               AS ticket_medio,
           COALESCE(SUM(desconto), 0)::text               AS total_descontos,
           (SELECT COALESCE(SUM(valor), 0)::text
              FROM caixa_movimentos
              WHERE empresa_id = $1
                AND criado_em >= $2::date
                AND criado_em < ($3::date + INTERVAL '1 day')
                AND tipo = 'estorno'
           )                                              AS total_estornos,
           COUNT(DISTINCT cliente_id)::text               AS clientes_unicos
         FROM pedidos
         WHERE empresa_id = $1
           AND ${dateFilter}
           AND deleted_at IS NULL
           AND status NOT IN ('cancelado', 'pendente')`,
        baseParams
      ),

      // Vendas por forma de pagamento (fonte: caixa_movimentos type=venda)
      query<{ forma_pagamento: string | null; total: string; qtd: string }>(
        `SELECT forma_pagamento,
                COALESCE(SUM(valor), 0)::text AS total,
                COUNT(*)::text                AS qtd
         FROM caixa_movimentos
         WHERE empresa_id = $1
           AND criado_em >= $2::date
           AND criado_em < ($3::date + INTERVAL '1 day')
           AND tipo = 'venda'
         GROUP BY forma_pagamento`,
        baseParams
      ),

      // Vendas por tipo de pedido
      query<{ tipo: string; total: string; qtd: string }>(
        `SELECT tipo,
                COALESCE(SUM(total), 0)::text AS total,
                COUNT(*)::text                AS qtd
         FROM pedidos
         WHERE empresa_id = $1
           AND ${dateFilter}
           AND deleted_at IS NULL
           AND status NOT IN ('cancelado')
         GROUP BY tipo`,
        baseParams
      ),

      // Distribuição por hora (0-23)
      query<{ hora: string; total: string; qtd: string }>(
        `SELECT EXTRACT(HOUR FROM created_at)::int::text AS hora,
                COALESCE(SUM(total), 0)::text             AS total,
                COUNT(*)::text                            AS qtd
         FROM pedidos
         WHERE empresa_id = $1
           AND ${dateFilter}
           AND deleted_at IS NULL
           AND status NOT IN ('cancelado')
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hora`,
        baseParams
      ),

      // Caixas no período
      queryOne<{ qtd: string; total_diferencas: string; com_diferenca: string }>(
        `SELECT
           COUNT(*)::text                                                  AS qtd,
           COALESCE(SUM(diferenca),                       0)::text         AS total_diferencas,
           COUNT(*) FILTER (WHERE ABS(COALESCE(diferenca, 0)) >= 0.01)::text AS com_diferenca
         FROM caixas
         WHERE empresa_id = $1
           AND aberto_em >= $2::date
           AND aberto_em < ($3::date + INTERVAL '1 day')
           AND status = 'fechado'`,
        baseParams
      ),

      // Top 5 produtos por receita
      query<{
        produto_id:    string | null;
        nome:          string;
        qtd_vendida:   string;
        receita:       string;
      }>(
        `SELECT pi.produto_id,
                pi.nome,
                COALESCE(SUM(pi.quantidade), 0)::text AS qtd_vendida,
                COALESCE(SUM(pi.subtotal),   0)::text AS receita
         FROM pedido_itens pi
         JOIN pedidos p ON p.id = pi.pedido_id
         WHERE p.empresa_id = $1
           AND p.${dateFilter}
           AND p.deleted_at IS NULL
           AND p.status NOT IN ('cancelado')
         GROUP BY pi.produto_id, pi.nome
         ORDER BY receita DESC
         LIMIT 5`,
        baseParams
      ),

      // Top 5 clientes por gasto no período
      query<{
        cliente_id:    string;
        nome:          string | null;
        pedidos:       string;
        total_gasto:   string;
      }>(
        `SELECT p.cliente_id,
                c.nome,
                COUNT(*)::text                AS pedidos,
                COALESCE(SUM(p.total), 0)::text AS total_gasto
         FROM pedidos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
         WHERE p.empresa_id = $1
           AND p.${dateFilter}
           AND p.cliente_id IS NOT NULL
           AND p.deleted_at IS NULL
           AND p.status NOT IN ('cancelado')
         GROUP BY p.cliente_id, c.nome
         ORDER BY total_gasto DESC
         LIMIT 5`,
        baseParams
      ),
    ]);

    return ok({
      periodo: { from, to },
      kpis: {
        total_pedidos:    Number(kpisRow?.total_pedidos    ?? 0),
        total_vendas:     Number(kpisRow?.total_vendas     ?? 0),
        ticket_medio:     Number(kpisRow?.ticket_medio     ?? 0),
        total_descontos:  Number(kpisRow?.total_descontos  ?? 0),
        total_estornos:   Number(kpisRow?.total_estornos   ?? 0),
        clientes_unicos:  Number(kpisRow?.clientes_unicos  ?? 0),
      },
      por_forma: porForma.map((r) => ({
        forma:  r.forma_pagamento ?? "outro",
        total:  Number(r.total),
        qtd:    Number(r.qtd),
      })),
      por_tipo: porTipo.map((r) => ({
        tipo:   r.tipo,
        total:  Number(r.total),
        qtd:    Number(r.qtd),
      })),
      por_hora: porHora.map((r) => ({
        hora:   Number(r.hora),
        total:  Number(r.total),
        qtd:    Number(r.qtd),
      })),
      caixas: {
        qtd:               Number(caixasInfo?.qtd               ?? 0),
        total_diferencas:  Number(caixasInfo?.total_diferencas  ?? 0),
        com_diferenca:     Number(caixasInfo?.com_diferenca     ?? 0),
      },
      top_produtos: topProdutos.map((r) => ({
        produto_id:   r.produto_id,
        nome:         r.nome,
        qtd_vendida:  Number(r.qtd_vendida),
        receita:      Number(r.receita),
      })),
      top_clientes: topClientes.map((r) => ({
        cliente_id:   r.cliente_id,
        nome:         r.nome ?? "Sem nome",
        pedidos:      Number(r.pedidos),
        total_gasto:  Number(r.total_gasto),
      })),
    });
  } catch (err) {
    console.error("[Relatorio/Financeiro]", err);
    return serverError();
  }
}
