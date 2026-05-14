/**
 * POST /api/painel/assinatura — cria assinatura recorrente PreApproval MP
 *   Body: vazio
 *   Devolve init_point pra cliente cadastrar cartão no MP
 *
 * DELETE /api/painel/assinatura — cancela assinatura ativa
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { criarAssinaturaRecorrente } from "@/lib/billing/mensalidades";
import { cancelarPreApproval } from "@/lib/billing/mercadopago";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master", "admin"].includes(role)) return forbidden("Apenas admin pode contratar assinatura");

  try {
    const r = await criarAssinaturaRecorrente(empresaId);
    if (!r.ok) return badRequest(r.motivo ?? "falha ao criar assinatura");
    return ok({
      init_point:    r.init_point,
      assinatura_id: r.assinatura_id,
      mensagem:      "Redirecione pro init_point pra cadastrar o cartão. Após autorização, MP cobra automaticamente todo mês.",
    });
  } catch (err) {
    console.error("[Assinatura/POST]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master", "admin"].includes(role)) return forbidden();

  try {
    const ass = await queryOne<{ id: string; mp_preapproval_id: string | null }>(
      `SELECT id, mp_preapproval_id FROM assinaturas
        WHERE empresa_id = $1 AND status IN ('pendente','autorizada','ativa')
        ORDER BY criado_em DESC LIMIT 1`,
      [empresaId]
    );
    if (!ass) return badRequest("nenhuma assinatura ativa");

    // Cancela no MP (best-effort)
    if (ass.mp_preapproval_id) {
      try {
        await cancelarPreApproval(ass.mp_preapproval_id);
      } catch (e) {
        console.warn("[Assinatura/DELETE] MP cancel falhou:", e);
      }
    }

    await query(
      `UPDATE assinaturas
          SET status = 'cancelada', cancelada_em = NOW(), cancelada_por = $2,
              motivo_cancelamento = 'cancelado pelo cliente'
        WHERE id = $1`,
      [ass.id, sub]
    );

    return ok({ cancelada: true });
  } catch (err) {
    console.error("[Assinatura/DELETE]", err);
    return serverError();
  }
}
