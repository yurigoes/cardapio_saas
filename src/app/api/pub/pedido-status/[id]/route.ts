/**
 * GET /api/pub/pedido-status/[id]
 *
 * Endpoint PÚBLICO (sem auth) que retorna status básico do pedido pra
 * página /p/[id] (acompanhamento via QR code).
 *
 * Devolve apenas dados não-sensíveis (sem CPF, endereço completo, etc).
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Valida UUID básico
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
  }

  try {
    const pedido = await queryOne<{
      numero: number;
      status: string;
      cliente_nome: string | null;
      total: string;
      tipo_consumo: string | null;
      created_at: string;
      empresa_nome: string;
      empresa_logo: string | null;
    }>(
      `SELECT p.numero, p.status, p.cliente_nome, p.total, p.tipo_consumo,
              p.created_at::text,
              e.nome_fantasia AS empresa_nome,
              e.logo_url      AS empresa_logo
         FROM pedidos p
         JOIN empresas e ON e.id = p.empresa_id
        WHERE p.id = $1
          AND p.deleted_at IS NULL`,
      [params.id]
    );

    if (!pedido) {
      return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });
    }

    const itens = await query<{ nome: string; quantidade: number; preco_unitario: number }>(
      `SELECT nome, quantidade, preco_unitario
         FROM pedido_itens
        WHERE pedido_id = $1
        ORDER BY id ASC`,
      [params.id]
    ).catch(() => []);

    return NextResponse.json({
      success: true,
      data: { ...pedido, itens },
    });
  } catch (err) {
    console.error("[PubPedidoStatus]", err);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
