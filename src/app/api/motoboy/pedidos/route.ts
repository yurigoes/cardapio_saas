/**
 * GET /api/motoboy/pedidos
 *
 * Lista pedidos atribuídos ao motoboy logado (via motoboys.usuario_id = sub).
 * Inclui pedidos em status_entrega = atribuido | coletado | em_rota.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (role !== "motoboy") return forbidden("Apenas motoboy");

  try {
    const motoboy = await queryOne<{ id: string }>(
      `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2`,
      [sub, empresaId]
    );
    if (!motoboy) return forbidden("Motoboy não vinculado");

    const pedidos = await query(
      `SELECT p.id, p.numero, p.total, p.status_entrega,
              p.cliente_nome, p.cliente_telefone, p.cliente_endereco,
              p.tracking_token, p.forma_pagamento,
              p.atribuido_em, p.coletado_em, p.entregue_em,
              p.valor_motoboy,
              z.nome AS zona_nome,
              EXISTS (SELECT 1 FROM pedido_pagamentos pp WHERE pp.pedido_id = p.id) AS pago
         FROM pedidos p
         LEFT JOIN zonas_entrega z ON z.id = p.zona_id
        WHERE p.empresa_id = $1
          AND p.motoboy_id = $2
          AND p.deleted_at IS NULL
          AND p.status_entrega IN ('atribuido', 'coletado', 'em_rota')
        ORDER BY p.atribuido_em ASC`,
      [empresaId, motoboy.id]
    );

    return ok({ motoboy_id: motoboy.id, pedidos });
  } catch (err) {
    console.error("[Motoboy/Pedidos]", err);
    return serverError();
  }
}
