/**
 * POST /api/painel/mensalidades/[id]/pagar
 *
 * Gera/recupera link Checkout Pro pra pagamento manual.
 * Devolve init_point pra UI redirecionar.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { criarPreferenciaPagamento } from "@/lib/billing/mensalidades";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master", "admin", "gerente", "financeiro"].includes(role)) return forbidden();

  // Verifica que mensalidade pertence à empresa
  const m = await queryOne<{ empresa_id: string }>(
    `SELECT empresa_id FROM mensalidades WHERE id = $1`,
    [params.id]
  );
  if (!m) return notFound();
  if (m.empresa_id !== empresaId) return forbidden();

  try {
    const r = await criarPreferenciaPagamento(params.id);
    if (!r.ok) return badRequest(r.motivo ?? "falha ao gerar link");
    return ok({
      init_point:    r.init_point,
      preference_id: r.preference_id,
      mensagem:      "Redirecione pro init_point pra pagar",
    });
  } catch (err) {
    console.error("[Mensalidades/Pagar]", err);
    return serverError();
  }
}
