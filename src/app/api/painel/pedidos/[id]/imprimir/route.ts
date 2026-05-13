/**
 * POST /api/painel/pedidos/[id]/imprimir
 * Body: { tipo?: "cozinha" | "cliente" | "ambos" }
 *
 * Enfileira o cupom no agente de impressão. Sem popup.
 * Default: 'ambos' (envia tanto pra cozinha quanto cupom do cliente).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError, badRequest } from "@/lib/utils/response";
import { dispatchCupomCozinha, dispatchCupomCliente } from "@/lib/print/dispatch";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let tipo = "ambos";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.tipo && ["cozinha", "cliente", "ambos"].includes(body.tipo)) {
      tipo = body.tipo;
    }
  } catch {}

  const pedido = await queryOne<{ id: string }>(
    `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [params.id, empresaId]
  );
  if (!pedido) return notFound("Pedido não encontrado");

  try {
    const acoes: Promise<void>[] = [];
    if (tipo === "cozinha" || tipo === "ambos") {
      acoes.push(dispatchCupomCozinha(empresaId, params.id));
    }
    if (tipo === "cliente" || tipo === "ambos") {
      acoes.push(dispatchCupomCliente(empresaId, params.id));
    }
    await Promise.all(acoes);

    return ok({
      enfileirado: true,
      tipo,
      mensagem: tipo === "ambos"
        ? "Cupom enviado pra cozinha e cupom do cliente enfileirados nas impressoras"
        : `Cupom (${tipo}) enfileirado na impressora correspondente`,
    });
  } catch (err) {
    console.error("[Pedidos/Imprimir]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
