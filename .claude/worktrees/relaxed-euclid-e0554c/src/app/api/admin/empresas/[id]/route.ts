import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

// GET /api/admin/empresas/[id] — Retorna dados completos da empresa incluindo campos slave
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden(); }

  try {
    // Tenta buscar com campos slave (migration 005). Se falhar (coluna não existe),
    // refaz a query sem esses campos para garantir compatibilidade.
    let empresa: Record<string, unknown> | null = null;
    try {
      empresa = await queryOne(
        `SELECT e.id, e.nome_fantasia, e.razao_social, e.cnpj, e.slug, e.subdominio,
                e.cor_primaria, e.cor_secundaria, e.whatsapp, e.telefone, e.email,
                e.status, e.plano_id, e.modulos_ativos, e.assinatura_expira_em,
                e.slave_key, e.slave_ativo, e.slave_ultimo_sync,
                e.created_at, e.updated_at,
                p.nome as plano_nome
         FROM empresas e
         LEFT JOIN planos p ON p.id = e.plano_id
         WHERE e.id = $1 AND e.deleted_at IS NULL`,
        [params.id]
      );
    } catch {
      // Migration 005 não foi aplicada — busca sem campos slave
      empresa = await queryOne(
        `SELECT e.id, e.nome_fantasia, e.razao_social, e.cnpj, e.slug, e.subdominio,
                e.cor_primaria, e.cor_secundaria, e.whatsapp, e.telefone, e.email,
                e.status, e.plano_id, e.modulos_ativos, e.assinatura_expira_em,
                e.created_at, e.updated_at,
                p.nome as plano_nome
         FROM empresas e
         LEFT JOIN planos p ON p.id = e.plano_id
         WHERE e.id = $1 AND e.deleted_at IS NULL`,
        [params.id]
      );
    }

    if (!empresa) return notFound("Empresa não encontrada");

    return ok(empresa);
  } catch (err) {
    console.error("[Admin/Empresas/GET]", err);
    return serverError();
  }
}

const updateSchema = z.object({
  status:               z.enum(["ativo","inativo","suspenso","bloqueado","teste"]).optional(),
  plano_id:             z.string().uuid().optional(),
  assinatura_expira_em: z.string().datetime().optional(),
  nome_fantasia:        z.string().min(2).max(255).optional(),
  email:                z.string().email().optional(),
  whatsapp:             z.string().max(20).optional(),
  modulos_ativos:       z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden(); }

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  if (Object.keys(body).length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const sets: string[]   = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.status !== undefined) {
      sets.push(`status = $${i++}`);
      values.push(body.status);
    }
    if (body.plano_id !== undefined) {
      sets.push(`plano_id = $${i++}`);
      values.push(body.plano_id);
    }
    if (body.assinatura_expira_em !== undefined) {
      sets.push(`assinatura_expira_em = $${i++}`);
      values.push(body.assinatura_expira_em);
    }
    if (body.nome_fantasia !== undefined) {
      sets.push(`nome_fantasia = $${i++}`);
      values.push(body.nome_fantasia);
    }
    if (body.email !== undefined) {
      sets.push(`email = $${i++}`);
      values.push(body.email);
    }
    if (body.whatsapp !== undefined) {
      sets.push(`whatsapp = $${i++}`);
      values.push(body.whatsapp);
    }
    if (body.modulos_ativos !== undefined) {
      sets.push(`modulos_ativos = $${i++}`);
      values.push(JSON.stringify(body.modulos_ativos));
    }

    sets.push(`updated_at = NOW()`);
    values.push(params.id);

    const empresa = await queryOne(
      `UPDATE empresas SET ${sets.join(", ")} WHERE id = $${i} AND deleted_at IS NULL RETURNING id`,
      values
    );

    if (!empresa) return notFound("Empresa não encontrada");

    return ok({ id: params.id });
  } catch (err) {
    console.error("[Admin/Empresas/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden(); }

  try {
    const empresa = await queryOne(
      `UPDATE empresas SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [params.id]
    );

    if (!empresa) return notFound("Empresa não encontrada");

    return ok({ id: params.id });
  } catch (err) {
    console.error("[Admin/Empresas/DELETE]", err);
    return serverError();
  }
}
