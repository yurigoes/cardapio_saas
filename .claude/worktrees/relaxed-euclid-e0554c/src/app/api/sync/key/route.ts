/**
 * POST /api/sync/key?id=<empresa_id>   — Gera nova slave_key (master only)
 * DELETE /api/sync/key?id=<empresa_id> — Revoga slave_key (master only)
 *
 * Requer: Authorization: Bearer <master_jwt>
 */

import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db/client";
import { generateSlaveKey } from "@/lib/sync/auth";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

// POST — Gera/regenera slave_key
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden("Acesso exclusivo para administradores master"); }

  const empresaId = req.nextUrl.searchParams.get("id");
  if (!empresaId) return badRequest("Parâmetro id é obrigatório");

  try {
    const newKey = generateSlaveKey();

    const empresa = await queryOne<{ id: string }>(
      `UPDATE empresas
       SET slave_key  = $1,
           slave_ativo = false,
           updated_at  = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [newKey, empresaId]
    );

    if (!empresa) return notFound("Empresa não encontrada");

    return ok({ slave_key: newKey });
  } catch (err) {
    console.error("[Sync/Key/POST]", err);
    return serverError();
  }
}

// DELETE — Revoga slave_key
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden("Acesso exclusivo para administradores master"); }

  const empresaId = req.nextUrl.searchParams.get("id");
  if (!empresaId) return badRequest("Parâmetro id é obrigatório");

  try {
    const empresa = await queryOne<{ id: string }>(
      `UPDATE empresas
       SET slave_key        = NULL,
           slave_ativo      = false,
           slave_ultimo_sync = NULL,
           updated_at        = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [empresaId]
    );

    if (!empresa) return notFound("Empresa não encontrada");

    return ok({ revogado: true });
  } catch (err) {
    console.error("[Sync/Key/DELETE]", err);
    return serverError();
  }
}
