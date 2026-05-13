import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const updateSchema = z.object({
  nome:          z.string().min(2).max(100).trim().optional(),
  descricao:     z.string().max(500).trim().nullable().optional(),
  bairro:        z.string().max(100).nullable().optional(),
  cep_inicio:    z.string().regex(/^\d{8}$/).nullable().optional().or(z.literal("").transform(() => null)),
  cep_fim:       z.string().regex(/^\d{8}$/).nullable().optional().or(z.literal("").transform(() => null)),
  taxa:          z.number().min(0).optional(),
  valor_cobrado: z.number().min(0).optional(),
  valor_motoboy: z.number().min(0).optional(),
  tempo_min:     z.number().int().min(0).nullable().optional(),
  ativo:         z.boolean().optional(),
  ordem:         z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "delivery:atribuir")) return forbidden();

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

    if (body.nome          !== undefined) { sets.push(`nome = $${i++}`);          values.push(body.nome); }
    if (body.descricao     !== undefined) { sets.push(`descricao = $${i++}`);     values.push(body.descricao); }
    if (body.bairro        !== undefined) { sets.push(`bairro = $${i++}`);        values.push(body.bairro); }
    if (body.cep_inicio    !== undefined) { sets.push(`cep_inicio = $${i++}`);    values.push(body.cep_inicio); }
    if (body.cep_fim       !== undefined) { sets.push(`cep_fim = $${i++}`);       values.push(body.cep_fim); }
    if (body.taxa          !== undefined) {
      sets.push(`taxa = $${i}, valor_cobrado = $${i++}`);
      values.push(body.taxa);
    } else if (body.valor_cobrado !== undefined) {
      sets.push(`valor_cobrado = $${i}, taxa = $${i++}`);
      values.push(body.valor_cobrado);
    }
    if (body.valor_motoboy !== undefined) { sets.push(`valor_motoboy = $${i++}`); values.push(body.valor_motoboy); }
    if (body.tempo_min     !== undefined) { sets.push(`tempo_min = $${i++}`);     values.push(body.tempo_min); }
    if (body.ativo         !== undefined) { sets.push(`ativo = $${i++}`);         values.push(body.ativo); }
    if (body.ordem         !== undefined) { sets.push(`ordem = $${i++}`);         values.push(body.ordem); }

    sets.push(`updated_at = NOW()`);
    values.push(params.id, empresaId);

    const zona = await queryOne(
      `UPDATE zonas_entrega SET ${sets.join(", ")}
       WHERE id = $${i} AND empresa_id = $${i + 1}
       RETURNING id`,
      values
    );

    if (!zona) return notFound("Zona de entrega não encontrada");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/ZonasEntrega/PATCH]", err);
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
  if (!temPermissao(role, "delivery:atribuir")) return forbidden();

  try {
    const zona = await queryOne(
      `DELETE FROM zonas_entrega
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [params.id, empresaId]
    );

    if (!zona) return notFound("Zona de entrega não encontrada");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/ZonasEntrega/DELETE]", err);
    return serverError();
  }
}
