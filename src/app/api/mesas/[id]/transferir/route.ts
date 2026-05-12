/**
 * POST /api/mesas/[id]/transferir
 *   body: { mesa_destino_id: uuid }
 *
 * Move o pedido_ativo da mesa origem para a mesa destino.
 * Mesa destino precisa estar livre. Tudo em transação.
 *
 * Útil quando cliente troca de mesa.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, conflict, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  mesa_destino_id: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:editar") && !temPermissao(role, "pedido:editar")) {
    return forbidden();
  }

  let body: z.output<typeof bodySchema>;
  try {
    const r = bodySchema.safeParse(await req.json());
    if (!r.success) return badRequest("mesa_destino_id obrigatório");
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  if (params.id === body.mesa_destino_id) {
    return badRequest("Mesa origem e destino não podem ser iguais");
  }

  try {
    const result = await transaction(async (client) => {
      // Lock nas duas mesas para evitar race
      // Ordem fixa pelo id para evitar deadlock
      const ids = [params.id, body.mesa_destino_id].sort();
      const mesas = await client.query<{
        id: string; numero: number; pedido_ativo_id: string | null;
      }>(
        `SELECT id, numero, pedido_ativo_id FROM mesas
         WHERE id = ANY($1::uuid[]) AND empresa_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [ids, empresaId]
      ).then(r => r.rows);

      const origem  = mesas.find(m => m.id === params.id);
      const destino = mesas.find(m => m.id === body.mesa_destino_id);

      if (!origem)  return { error: "origem_not_found" as const };
      if (!destino) return { error: "destino_not_found" as const };
      if (!origem.pedido_ativo_id) return { error: "origem_vazia" as const };
      if (destino.pedido_ativo_id) return { error: "destino_ocupada" as const };

      // Move o pedido
      await client.query(
        `UPDATE pedidos SET mesa_id = $1, updated_at = NOW()
         WHERE id = $2 AND empresa_id = $3`,
        [destino.id, origem.pedido_ativo_id, empresaId]
      );

      // Atualiza referências das mesas
      await client.query(
        `UPDATE mesas SET pedido_ativo_id = NULL, status = 'livre', updated_at = NOW()
         WHERE id = $1 AND empresa_id = $2`,
        [origem.id, empresaId]
      );
      await client.query(
        `UPDATE mesas SET pedido_ativo_id = $1, status = 'ocupada', updated_at = NOW()
         WHERE id = $2 AND empresa_id = $3`,
        [origem.pedido_ativo_id, destino.id, empresaId]
      );

      return {
        ok: true,
        de:    { id: origem.id,  numero: origem.numero  },
        para:  { id: destino.id, numero: destino.numero },
        pedido_id: origem.pedido_ativo_id,
      };
    });

    if ("error" in result) {
      switch (result.error) {
        case "origem_not_found":  return notFound("Mesa de origem não encontrada");
        case "destino_not_found": return notFound("Mesa de destino não encontrada");
        case "origem_vazia":      return badRequest("Mesa de origem não tem pedido ativo");
        case "destino_ocupada":   return conflict("Mesa de destino já está ocupada");
      }
    }

    return ok(result);
  } catch (err) {
    console.error("[Mesas/Transferir]", err);
    return serverError();
  }
}
