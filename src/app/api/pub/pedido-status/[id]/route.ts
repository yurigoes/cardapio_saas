/**
 * GET /api/pub/pedido-status/[id]
 *
 * Endpoint PÚBLICO (sem auth) — dados de acompanhamento pra /p/[id].
 * Inclui status_entrega + dados do cliente cadastrado (pontos).
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const isFullUuid = /^[0-9a-f-]{36}$/i.test(params.id);
  const isShortId  = /^[0-9a-f]{8,32}$/i.test(params.id);
  if (!isFullUuid && !isShortId) {
    return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
  }

  const baseSelect = `
    p.id, p.numero, p.status, p.cliente_id, p.cliente_nome, p.total,
    p.tipo_consumo, p.created_at::text,
    COALESCE(p.status_entrega, NULL) AS status_entrega,
    e.id              AS empresa_id,
    e.slug            AS empresa_slug,
    e.nome_fantasia   AS empresa_nome,
    e.logo_url        AS empresa_logo,
    e.cor_primaria    AS empresa_cor,
    c.pontos          AS cliente_pontos
  `;

  // Tenta com cliente_id JOIN; fallback sem coluna status_entrega se não existir
  async function buscar(comStatusEntrega: boolean) {
    const cols = comStatusEntrega
      ? baseSelect
      : baseSelect.replace("COALESCE(p.status_entrega, NULL) AS status_entrega,", "NULL AS status_entrega,");
    return queryOne(
      isFullUuid
        ? `SELECT ${cols}
             FROM pedidos p
             JOIN empresas e ON e.id = p.empresa_id
        LEFT JOIN clientes c  ON c.id = p.cliente_id
            WHERE p.id = $1 AND p.deleted_at IS NULL`
        : `SELECT ${cols}
             FROM pedidos p
             JOIN empresas e ON e.id = p.empresa_id
        LEFT JOIN clientes c  ON c.id = p.cliente_id
            WHERE p.id::text LIKE $1 || '%' AND p.deleted_at IS NULL
            ORDER BY p.created_at DESC LIMIT 1`,
      [params.id]
    );
  }

  try {
    let pedido: Record<string, unknown> | null = null;
    try { pedido = await buscar(true); }
    catch (e) {
      console.warn("[PubPedidoStatus] retry sem status_entrega:", e instanceof Error ? e.message : e);
      pedido = await buscar(false);
    }

    if (!pedido) {
      return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });
    }

    const pedidoIdCompleto = String(pedido.id ?? params.id);

    const itens = await query<{ nome: string; quantidade: number; preco_unitario: number }>(
      `SELECT nome, quantidade, preco_unitario
         FROM pedido_itens
        WHERE pedido_id = $1
        ORDER BY id ASC`,
      [pedidoIdCompleto]
    ).catch(() => []);

    // Pontos ganhos com este pedido (busca em audit/log se houver, senão calcula
    // baseado na config de fidelidade — best effort sem quebrar)
    let pontosGanhos: number | null = null;
    try {
      const cfg = await queryOne<{ pontos_por_real: number; fidelidade_ativo: boolean }>(
        `SELECT pontos_por_real, fidelidade_ativo FROM empresas WHERE id = $1`,
        [pedido.empresa_id]
      );
      if (cfg?.fidelidade_ativo && cfg.pontos_por_real > 0) {
        pontosGanhos = Math.floor(Number(pedido.total ?? 0) * cfg.pontos_por_real);
      }
    } catch {}

    return NextResponse.json({
      success: true,
      data: {
        ...pedido,
        itens,
        cliente_pontos_ganhos_pedido: pontosGanhos,
      },
    });
  } catch (err) {
    console.error("[PubPedidoStatus]", err);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
