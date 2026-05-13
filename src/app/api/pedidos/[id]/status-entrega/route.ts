/**
 * POST /api/pedidos/[id]/status-entrega
 * Body: { status: aguardando|atribuido|coletado|em_rota|entregue|cancelado }
 *
 * Atualiza estado do delivery e timestamps relevantes.
 * Quando 'entregue', atualiza pedidos.status='entregue' e libera motoboy implicitamente.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { notificarConfirmacaoCliente } from "@/lib/notify/evolution";

const STATUS = ["aguardando", "atribuido", "coletado", "em_rota", "entregue", "cancelado"] as const;

const bodySchema = z.object({
  status: z.enum(STATUS),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  // Motoboy pode mudar status de seus próprios pedidos
  const isMotoboy = role === "motoboy";
  // Outros precisam de pedido:editar
  if (!isMotoboy) {
    const { temPermissao } = await import("@/lib/auth/rbac");
    if (!temPermissao(role, "pedido:editar")) return forbidden();
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    // Se motoboy, garante que ele é o atribuído
    let extraWhere = "";
    const vals: unknown[] = [params.id, empresaId];
    if (isMotoboy) {
      // motoboys.usuario_id = sub
      const motoboy = await queryOne<{ id: string }>(
        `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2`,
        [sub, empresaId]
      );
      if (!motoboy) return forbidden("Motoboy não vinculado");
      vals.push(motoboy.id);
      extraWhere = ` AND motoboy_id = $3`;
    }

    const tsField = body.status === "coletado" ? "coletado_em"
                  : body.status === "entregue" ? "entregue_em"
                  : null;
    const tsClause = tsField ? `, ${tsField} = NOW()` : "";

    const pedidoStatusClause = body.status === "entregue"
      ? `, status = 'entregue'`
      : "";

    const updated = await queryOne<{ id: string; cliente_telefone: string | null; numero: number | null; total: string | null }>(
      `UPDATE pedidos
          SET status_entrega = $${vals.length + 1}
          ${tsClause}
          ${pedidoStatusClause}
          , updated_at = NOW()
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL ${extraWhere}
        RETURNING id, cliente_telefone, numero, total`,
      [...vals, body.status]
    );

    if (!updated) return notFound();

    await auditLog({
      acao:       "pedido:status-entrega",
      recurso:    "pedidos",
      recursoId:  params.id,
      dadosNovos: { status: body.status },
      usuario:    { sub, empresaId },
    });

    // Notifica cliente em transições importantes (best-effort)
    if (body.status === "em_rota" || body.status === "entregue") {
      // Reaproveita 'pronto' ou 'confirmado' template; aqui simples 'pronto'
      notificarConfirmacaoCliente(empresaId, params.id)
        .catch(e => console.warn("[StatusEntrega] notify:", e));
    }

    return ok({ id: params.id, status_entrega: body.status });
  } catch (err) {
    console.error("[Pedidos/StatusEntrega]", err);
    return serverError();
  }
}
