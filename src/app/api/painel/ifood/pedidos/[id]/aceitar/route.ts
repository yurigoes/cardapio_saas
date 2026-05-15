/**
 * POST /api/painel/ifood/pedidos/[id]/aceitar
 *
 * Aceite manual de pedido iFood pendente:
 *   1. Chama /confirm na API do iFood
 *   2. Atualiza status do pedido (pendente → confirmado)
 *   3. Marca ifood_aceite_status='aceito' + autor + timestamp
 *   4. Dispara cupom para impressão na cozinha
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { confirmOrder, getIfoodConfig } from "@/lib/ifood/client";
import { dispatchCupomCozinha } from "@/lib/print/dispatch";
import { ok, forbidden, badRequest, serverError, notFound } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "operador"];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub: userId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const pedido = await queryOne<{
      id: string;
      ifood_order_id: string | null;
      ifood_aceite_status: string | null;
    }>(
      `SELECT id, ifood_order_id, ifood_aceite_status
         FROM pedidos
        WHERE id = $1 AND empresa_id = $2 AND origem = 'ifood'`,
      [params.id, empresaId]
    );
    if (!pedido) return notFound("Pedido não encontrado");
    if (!pedido.ifood_order_id) return badRequest("Pedido sem ifood_order_id");
    if (pedido.ifood_aceite_status && pedido.ifood_aceite_status !== "pendente") {
      return badRequest(`Pedido já está '${pedido.ifood_aceite_status}'`);
    }

    const cfg = await getIfoodConfig(empresaId);
    if (!cfg) return badRequest("Configuração iFood ausente");

    const okResp = await confirmOrder(cfg, pedido.ifood_order_id);
    if (!okResp) return serverError("iFood recusou /confirm — verifique credenciais ou status do pedido");

    await queryOne(
      `UPDATE pedidos
          SET status              = 'confirmado',
              ifood_aceite_status = 'aceito',
              ifood_aceite_em     = NOW(),
              ifood_aceite_por    = $1
        WHERE id = $2`,
      [userId, params.id]
    );

    dispatchCupomCozinha(empresaId, params.id)
      .catch((e) => console.warn("[Ifood/aceitar] cozinha:", e));

    return ok({ aceito: true });
  } catch (err) {
    console.error("[Ifood/aceitar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
