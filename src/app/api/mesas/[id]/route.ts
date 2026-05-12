import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError, conflict } from "@/lib/utils/response";
import { isDuplicateKeyError } from "@/lib/utils/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:ver")) return forbidden();

  try {
    const mesa = await queryOne(
      `SELECT
         m.id, m.numero, m.nome, m.capacidade, m.setor, m.status, m.qrcode_url,
         p.id          as pedido_id,
         p.numero      as pedido_numero,
         p.total       as pedido_total,
         p.subtotal    as pedido_subtotal,
         p.status      as pedido_status,
         p.created_at  as pedido_criado_em,
         EXTRACT(EPOCH FROM (NOW() - p.created_at))::int as tempo_aberta_segundos
       FROM mesas m
       LEFT JOIN pedidos p ON p.id = m.pedido_ativo_id AND p.deleted_at IS NULL
       WHERE m.id = $1 AND m.empresa_id = $2 AND m.deleted_at IS NULL`,
      [params.id, empresaId]
    );

    if (!mesa) return notFound("Mesa não encontrada");
    return ok(mesa);
  } catch (err) {
    console.error("[Mesas/GET-ONE]", err);
    return serverError();
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  numero:     z.number().int().min(1).max(9999).optional(),
  nome:       z.string().max(50).optional().nullable(),
  capacidade: z.number().int().min(1).max(100).optional(),
  setor:      z.string().max(100).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:editar")) return forbidden();

  let body: z.output<typeof patchSchema>;
  try {
    const r = patchSchema.safeParse(await req.json());
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  const fields: Record<string, unknown> = {};
  if (body.numero     !== undefined) fields.numero     = body.numero;
  if (body.nome       !== undefined) fields.nome       = body.nome;
  if (body.capacidade !== undefined) fields.capacidade = body.capacidade;
  if (body.setor      !== undefined) fields.setor      = body.setor;

  if (Object.keys(fields).length === 0) {
    return badRequest("Nenhum campo para atualizar");
  }

  try {
    const sets   = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
    const values = Object.values(fields);
    sets.push("updated_at = NOW()");
    values.push(params.id, empresaId);

    const updated = await queryOne(
      `UPDATE mesas SET ${sets.join(", ")}
       WHERE id = $${values.length - 1} AND empresa_id = $${values.length} AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    if (!updated) return notFound("Mesa não encontrada");
    return ok({ id: params.id, updated: true });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return conflict(`Já existe outra mesa com este número`);
    }
    console.error("[Mesas/PATCH]", err);
    return serverError();
  }
}

// ── DELETE (soft) ─────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:editar")) return forbidden();

  try {
    // Não permite excluir mesa ocupada
    const mesa = await queryOne<{ pedido_ativo_id: string | null }>(
      `SELECT pedido_ativo_id FROM mesas
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!mesa) return notFound("Mesa não encontrada");
    if (mesa.pedido_ativo_id) {
      return conflict("Mesa está ocupada — feche-a antes de excluir");
    }

    await queryOne(
      `UPDATE mesas SET deleted_at = NOW(), status = 'inativa'
       WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );

    return ok({ deleted: true });
  } catch (err) {
    console.error("[Mesas/DELETE]", err);
    return serverError();
  }
}
