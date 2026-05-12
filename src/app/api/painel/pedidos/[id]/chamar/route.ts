/**
 * POST /api/painel/pedidos/[id]/chamar
 * Registra chamada do cliente no painel TV.
 * Chamado pela cozinha quando o pedido está pronto.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db/client";
import { ok, notFound, forbidden, serverError } from "@/lib/utils/response";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    // Busca pedido
    const pedido = await queryOne<{
      id:           string;
      numero:       number;
      cliente_nome: string | null;
      empresa_id:   string;
    }>(
      `SELECT id, numero, cliente_nome, empresa_id
       FROM pedidos
       WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );

    if (!pedido) return notFound("Pedido não encontrado");
    if (pedido.empresa_id !== empresaId) return forbidden();

    // Opcional: nome do balcão via body
    let balcao = "Balcão 1";
    try {
      const body = await req.json();
      if (body?.balcao) balcao = String(body.balcao).slice(0, 50);
    } catch { /* body optional */ }

    // Insere chamada
    const rows = await query<{ id: string }>(
      `INSERT INTO chamados_painel
         (empresa_id, pedido_id, numero, cliente_nome, balcao, status)
       VALUES ($1, $2, $3, $4, $5, 'chamando')
       RETURNING id`,
      [empresaId, pedido.id, pedido.numero, pedido.cliente_nome, balcao]
    );

    return ok({ chamado_id: rows[0]?.id, numero: pedido.numero });
  } catch (err) {
    console.error("[Pedidos/Chamar/POST]", err);
    return serverError();
  }
}
