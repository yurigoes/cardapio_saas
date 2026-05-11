/**
 * PATCH /api/sync/pedidos/[id]/impresso — Slave confirma impressão
 */
import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db/client";
import { verifySlaveJWT, extractBearer } from "@/lib/sync/auth";
import { ok, unauthorized, notFound, serverError } from "@/lib/utils/response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = extractBearer(req.headers.get("authorization"));
  if (!token) return unauthorized("Token ausente");

  let payload;
  try {
    payload = await verifySlaveJWT(token);
  } catch {
    return unauthorized("Token inválido");
  }

  try {
    const pedido = await queryOne<{ id: string }>(
      `UPDATE pedidos
       SET impresso_em = NOW(), updated_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [params.id, payload.empresaId]
    );

    if (!pedido) return notFound("Pedido não encontrado");
    return ok({ impresso: true, id: pedido.id });
  } catch (err) {
    console.error("[Sync/Pedidos/PATCH]", err);
    return serverError();
  }
}
