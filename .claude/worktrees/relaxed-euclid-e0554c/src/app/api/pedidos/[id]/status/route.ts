import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";

const statusSchema = z.object({
  status: z.enum([
    "confirmado", "preparando", "pronto", "entregue",
    "cancelado", "aguardando_pagamento", "pago",
  ]),
  motivo: z.string().max(500).optional(),
});

// Transições válidas de status
const VALID_TRANSITIONS: Record<string, string[]> = {
  pendente:              ["confirmado", "cancelado"],
  confirmado:            ["preparando", "cancelado"],
  preparando:            ["pronto", "cancelado"],
  pronto:                ["entregue", "cancelado"],
  aguardando_pagamento:  ["pago", "cancelado"],
  entregue:              ["pago"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();

  if (!temPermissao(role, "pedido:editar")) return forbidden();

  let body: z.infer<typeof statusSchema>;
  try {
    body = statusSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof z.ZodError ? err.errors[0]?.message : "Dados inválidos";
    return badRequest(msg ?? "Dados inválidos");
  }

  try {
    const pedido = await queryOne<{ id: string; status: string; empresa_id: string }>(
      `SELECT id, status, empresa_id FROM pedidos WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );

    if (!pedido) return notFound("Pedido");
    if (pedido.empresa_id !== empresaId) return forbidden("Pedido não pertence à sua empresa");

    // Valida transição
    const validNext = VALID_TRANSITIONS[pedido.status] || [];
    if (!validNext.includes(body.status)) {
      return badRequest(
        `Transição inválida: ${pedido.status} → ${body.status}. ` +
        `Transições válidas: ${validNext.join(", ")}`
      );
    }

    // Campos de timestamp por status
    const timestampField: Record<string, string> = {
      confirmado:  "aceito_em",
      preparando:  "preparando_em",
      pronto:      "pronto_em",
      entregue:    "entregue_em",
      cancelado:   "cancelado_em",
    };

    const tsField = timestampField[body.status];
    const tsClause = tsField ? `, ${tsField} = NOW()` : "";
    const cancelClause = body.status === "cancelado" && body.motivo
      ? `, motivo_cancelamento = $4`
      : "";

    const queryValues: unknown[] = [body.status, params.id, empresaId];
    if (body.status === "cancelado" && body.motivo) {
      queryValues.push(body.motivo);
    }

    await query(
      `UPDATE pedidos
       SET status = $1, updated_at = NOW()${tsClause}${cancelClause}
       WHERE id = $2 AND empresa_id = $3`,
      queryValues
    );

    await auditLog({
      acao:           "pedido:status",
      recurso:        "pedidos",
      recursoId:      params.id,
      dadosAnteriores: { status: pedido.status },
      dadosNovos:      { status: body.status },
      usuario:        { sub: auth.payload.sub, empresaId },
    });

    return ok({ id: params.id, status: body.status });
  } catch (err) {
    console.error("[Pedidos/Status]", err);
    return serverError();
  }
}
