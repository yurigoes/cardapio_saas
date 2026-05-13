import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const updateSchema = z.object({
  nome:       z.string().min(2).max(100).trim().optional(),
  telefone:   z.string().max(20).trim().optional(),
  veiculo:    z.string().max(50).trim().optional(),
  placa:      z.string().max(10).trim().optional(),
  status:     z.enum(["disponivel", "em_entrega", "inativo"]).optional(),
  ativo:      z.boolean().optional(),
  usuario_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "motoboy:gerenciar")) return forbidden();

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  if (Object.keys(body).length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const sets: string[]    = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.nome       !== undefined) { sets.push(`nome = $${i++}`);       values.push(body.nome); }
    if (body.telefone   !== undefined) { sets.push(`telefone = $${i++}`);   values.push(body.telefone); }
    if (body.veiculo    !== undefined) { sets.push(`veiculo = $${i++}`);    values.push(body.veiculo); }
    if (body.placa      !== undefined) { sets.push(`placa = $${i++}`);      values.push(body.placa); }
    if (body.status     !== undefined) { sets.push(`status = $${i++}`);     values.push(body.status); }
    if (body.ativo      !== undefined) { sets.push(`ativo = $${i++}`);      values.push(body.ativo); }
    if (body.usuario_id !== undefined) { sets.push(`usuario_id = $${i++}`); values.push(body.usuario_id); }

    sets.push(`updated_at = NOW()`);
    values.push(params.id, empresaId);

    const motoboy = await queryOne(
      `UPDATE motoboys SET ${sets.join(", ")}
       WHERE id = $${i} AND empresa_id = $${i + 1} AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    if (!motoboy) return notFound("Motoboy não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Motoboys/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "motoboy:gerenciar")) return forbidden();

  try {
    const motoboy = await queryOne(
      `UPDATE motoboys SET ativo = false, deleted_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [params.id, empresaId]
    );

    if (!motoboy) return notFound("Motoboy não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Motoboys/DELETE]", err);
    return serverError();
  }
}
