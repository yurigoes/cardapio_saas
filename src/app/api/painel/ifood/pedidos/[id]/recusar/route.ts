/**
 * POST /api/painel/ifood/pedidos/[id]/recusar
 * Body: { reason?: string, cancellationCode?: string }
 *
 * Recusa manual de pedido iFood pendente.
 * cancellationCode default '801' = "MERCHANT_REQUESTED" (motivo do estabelecimento).
 * Códigos compatíveis com iFood: ver docs Merchant API /requestCancellation.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { cancelOrder, getIfoodConfig } from "@/lib/ifood/client";
import { ok, forbidden, badRequest, serverError, notFound } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "operador"];

const schema = z.object({
  reason:           z.string().min(3).max(200).optional().default("Recusado pelo estabelecimento"),
  cancellationCode: z.string().max(10).optional().default("801"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub: userId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json().catch(() => ({}))); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

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

    const okResp = await cancelOrder(cfg, pedido.ifood_order_id, body.reason, body.cancellationCode);
    if (!okResp) return serverError("iFood recusou /requestCancellation — verifique código de motivo");

    await queryOne(
      `UPDATE pedidos
          SET status              = 'cancelado',
              ifood_aceite_status = 'recusado',
              ifood_aceite_em     = NOW(),
              ifood_aceite_por    = $1
        WHERE id = $2`,
      [userId, params.id]
    );

    return ok({ recusado: true });
  } catch (err) {
    console.error("[Ifood/recusar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
