import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const STATUS_SEQUENCE = ["pendente", "em_preparo", "pronto", "entregue", "cancelado"] as const;
type PedidoStatus = typeof STATUS_SEQUENCE[number];

const patchSchema = z.object({
  status: z.enum(STATUS_SEQUENCE),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "pedido:ver")) return forbidden();

  try {
    const pedido = await queryOne<Record<string, unknown>>(
      `SELECT p.*,
              m.numero as mesa_numero,
              u.nome   as atendente_nome
       FROM pedidos p
       LEFT JOIN mesas    m ON m.id = p.mesa_id
       LEFT JOIN usuarios u ON u.id = p.atendente_id
       WHERE p.id = $1 AND p.empresa_id = $2 AND p.deleted_at IS NULL`,
      [params.id, empresaId]
    );

    if (!pedido) return notFound("Pedido não encontrado");

    const itens = await query(
      `SELECT pi.id, pi.nome, pi.quantidade, pi.preco_unitario, pi.subtotal, pi.observacoes
       FROM pedido_itens pi
       WHERE pi.pedido_id = $1
       ORDER BY pi.created_at ASC`,
      [params.id]
    );

    return ok({ ...pedido, itens });
  } catch (err) {
    console.error("[Pedidos/GET-ONE]", err);
    return serverError();
  }
}

// ─────────────────────────────────────────────
// PATCH /api/pedidos/[id] — Atualiza status
// ─────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();

  // cozinha usa cozinha:atualizar; outros precisam de pedido:editar
  const podePorCozinha = temPermissao(role, "cozinha:atualizar");
  const podePorPainel  = temPermissao(role, "pedido:editar");
  if (!podePorCozinha && !podePorPainel) return forbidden();

  let body: { status: PedidoStatus };
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return badRequest("Status inválido");
  }

  try {
    const pedido = await queryOne<{ id: string; status: string; mesa_id: string | null }>(
      `SELECT id, status, mesa_id FROM pedidos
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!pedido) return notFound("Pedido não encontrado");

    await queryOne(
      `UPDATE pedidos SET status = $1, updated_at = NOW() WHERE id = $2`,
      [body.status, params.id]
    );

    // Se entregue e tinha mesa, libera a mesa
    if (body.status === "entregue" && pedido.mesa_id) {
      await queryOne(
        `UPDATE mesas SET status = 'livre', pedido_ativo_id = NULL WHERE id = $1`,
        [pedido.mesa_id]
      );
    }

    return ok({ id: params.id, status: body.status });
  } catch (err) {
    console.error("[Pedidos/PATCH]", err);
    return serverError();
  }
}
