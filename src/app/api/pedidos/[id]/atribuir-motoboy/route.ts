/**
 * POST /api/pedidos/[id]/atribuir-motoboy
 * Body: { motoboy_id: uuid | null }
 *
 * Atribui (ou desatribui) motoboy a um pedido delivery.
 * Atualiza status_entrega para 'atribuido' (ou volta para 'aguardando' se null).
 * Aplica valor_motoboy do snapshot da zona.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import type { PoolClient } from "pg";

const bodySchema = z.object({
  motoboy_id: z.string().uuid().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "pedido:editar")) return forbidden();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const result = await transaction(async (client: PoolClient) => {
      const pedido = await client.query<{
        id: string; tipo: string; status_entrega: string | null;
      }>(
        `SELECT id, tipo, status_entrega
           FROM pedidos
          WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [params.id, empresaId]
      ).then(r => r.rows[0]);

      if (!pedido) return { error: "not_found" as const };
      if (pedido.tipo !== "delivery") return { error: "not_delivery" as const };

      // Se motoboy_id, valida que pertence à empresa e está ativo
      if (body.motoboy_id) {
        const m = await client.query<{ id: string; nome: string }>(
          `SELECT id, nome FROM motoboys
            WHERE id = $1 AND empresa_id = $2
              AND COALESCE(ativo, TRUE) = TRUE
              AND deleted_at IS NULL`,
          [body.motoboy_id, empresaId]
        ).then(r => r.rows[0]);
        if (!m) return { error: "motoboy_invalid" as const };
      }

      const novoStatus = body.motoboy_id ? "atribuido" : "aguardando";
      const atribuidoEm = body.motoboy_id ? "NOW()" : "NULL";

      await client.query(
        `UPDATE pedidos
            SET motoboy_id     = $1,
                status_entrega = $2,
                atribuido_em   = ${atribuidoEm},
                updated_at     = NOW()
          WHERE id = $3`,
        [body.motoboy_id, novoStatus, params.id]
      );

      return { ok: true, motoboy_id: body.motoboy_id, status_entrega: novoStatus };
    });

    if ("error" in result) {
      if (result.error === "not_found")       return notFound();
      if (result.error === "not_delivery")    return badRequest("Pedido não é delivery");
      if (result.error === "motoboy_invalid") return badRequest("Motoboy inválido ou inativo");
    }

    await auditLog({
      acao:       body.motoboy_id ? "pedido:atribuir-motoboy" : "pedido:desatribuir-motoboy",
      recurso:    "pedidos",
      recursoId:  params.id,
      dadosNovos: { motoboy_id: body.motoboy_id },
      usuario:    { sub, empresaId },
    });

    return ok(result);
  } catch (err) {
    console.error("[Pedidos/AtribuirMotoboy]", err);
    return serverError();
  }
}
