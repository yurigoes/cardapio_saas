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
import { notificarClienteSobrePedido } from "@/lib/notify/evolution";
import { enviarLinkRastreio } from "@/lib/delivery/rastreio";
import { syncIfoodAsync } from "@/lib/ifood/sync-status";

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
      // motoboys.usuario_id = sub — usa helper que auto-vincula se faltar
      const { resolveMotoboyId } = await import("@/lib/delivery/resolveMotoboy");
      const motoboyId = await resolveMotoboyId(sub, empresaId, role);
      if (!motoboyId) return forbidden("Motoboy não vinculado");
      vals.push(motoboyId);
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

    if (!updated) {
      // Diagnóstico: o pedido existe? motoboy bate?
      const diag = await queryOne<{ status_entrega: string | null; motoboy_id: string | null }>(
        `SELECT status_entrega, motoboy_id::text FROM pedidos
          WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
        [params.id, empresaId]
      );
      if (!diag) return notFound("Pedido não encontrado");
      if (isMotoboy && diag.motoboy_id !== vals[2]) {
        return forbidden(`Este pedido está atribuído a outro motoboy${diag.motoboy_id ? "" : " (ou ainda sem atribuição)"}.`);
      }
      if (diag.status_entrega === body.status) {
        // Idempotente: já está no status pedido
        return ok({ id: params.id, status_entrega: body.status, jaEstava: true });
      }
      return badRequest(`Não foi possível atualizar status (atual=${diag.status_entrega ?? "—"})`);
    }

    await auditLog({
      acao:       "pedido:status-entrega",
      recurso:    "pedidos",
      recursoId:  params.id,
      dadosNovos: { status: body.status },
      usuario:    { sub, empresaId },
    });

    // Notifica cliente em transições importantes (best-effort).
    if (body.status === "atribuido" || body.status === "coletado" || body.status === "em_rota") {
      // Link de rastreio com nome do motoboy (cliente acompanha em tempo real)
      enviarLinkRastreio(empresaId, params.id)
        .catch(e => console.warn("[StatusEntrega] rastreio:", e));

      // Notifica evento 'saiu_entrega' (template padrão tem {link_acompanhar})
      notificarClienteSobrePedido(empresaId, params.id, "saiu_entrega")
        .catch(e => console.warn("[StatusEntrega] saiu_entrega:", e));

      syncIfoodAsync(empresaId, params.id, "em_entrega");
    }
    if (body.status === "entregue") {
      syncIfoodAsync(empresaId, params.id, "entregue");
      // Notifica como ENTREGUE (não confirmado)
      notificarClienteSobrePedido(empresaId, params.id, "entregue")
        .catch(e => console.warn("[StatusEntrega] entregue:", e));
    }
    if (body.status === "cancelado") {
      syncIfoodAsync(empresaId, params.id, "cancelado");
      notificarClienteSobrePedido(empresaId, params.id, "cancelado")
        .catch(e => console.warn("[StatusEntrega] cancelado:", e));
    }

    return ok({ id: params.id, status_entrega: body.status });
  } catch (err) {
    console.error("[Pedidos/StatusEntrega]", err);
    return serverError();
  }
}
