/**
 * GET /api/painel/caixa/[id]/preview-fechamento
 *
 * Mostra preview do que vai ser fechado: vendas por forma + entregas
 * dos motoboys hoje. Usado pelo modal de fechamento pra exibir antes
 * de confirmar.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const caixa = await queryOne<{
      id: string; status: string; aberto_em: string; valor_abertura: string;
    }>(
      `SELECT id, status, aberto_em, valor_abertura
         FROM caixas WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!caixa) return notFound();

    // Vendas por forma
    const vendas = await query<{ forma: string; total: string; n: string }>(
      `SELECT COALESCE(forma_pagamento, 'outro') AS forma,
              COALESCE(SUM(valor), 0) AS total, COUNT(*)::text AS n
         FROM caixa_movimentos
        WHERE caixa_id = $1 AND tipo = 'venda'
        GROUP BY forma_pagamento
        ORDER BY total DESC`,
      [params.id]
    );

    // Reforços/sangrias
    const movimentos = await query<{ tipo: string; total: string; n: string }>(
      `SELECT tipo, COALESCE(SUM(valor), 0) AS total, COUNT(*)::text AS n
         FROM caixa_movimentos
        WHERE caixa_id = $1 AND tipo != 'venda'
        GROUP BY tipo`,
      [params.id]
    );

    // Motoboys hoje
    const dataLocal = new Date().toISOString().slice(0, 10);
    const motoboys = await query<{
      motoboy_id: string; motoboy_nome: string;
      total_corridas: string; total_taxas: string; total_pedidos: string;
    }>(
      `SELECT p.motoboy_id, mb.nome AS motoboy_nome,
              COUNT(*)::text AS total_corridas,
              COALESCE(SUM(p.taxa_entrega), 0)::text AS total_taxas,
              COALESCE(SUM(p.total), 0)::text AS total_pedidos
         FROM pedidos p
         LEFT JOIN motoboys mb ON mb.id = p.motoboy_id
        WHERE p.empresa_id = $1
          AND p.motoboy_id IS NOT NULL
          AND DATE(p.created_at AT TIME ZONE 'America/Bahia') = $2::date
          AND p.deleted_at IS NULL
        GROUP BY p.motoboy_id, mb.nome
        ORDER BY total_taxas DESC`,
      [empresaId, dataLocal]
    );

    const totalVendas = vendas.reduce((acc, v) => acc + Number(v.total), 0);

    return ok({
      caixa: { id: caixa.id, status: caixa.status, aberto_em: caixa.aberto_em,
               valor_abertura: Number(caixa.valor_abertura) },
      vendas_por_forma: vendas.map(v => ({
        forma: v.forma, total: Number(v.total), pedidos: Number(v.n),
      })),
      total_vendas: totalVendas,
      movimentos: movimentos.map(m => ({
        tipo: m.tipo, total: Number(m.total), qtd: Number(m.n),
      })),
      motoboys: motoboys.map(m => ({
        motoboy_id:    m.motoboy_id,
        motoboy_nome:  m.motoboy_nome,
        total_corridas: Number(m.total_corridas),
        total_taxas:   Number(m.total_taxas),
        total_pedidos: Number(m.total_pedidos),
      })),
      data: dataLocal,
    });
  } catch (err) {
    console.error("[Caixa/PreviewFechamento]", err);
    return serverError();
  }
}
