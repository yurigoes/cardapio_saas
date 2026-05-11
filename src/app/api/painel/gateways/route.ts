/**
 * GET  /api/painel/gateways  → retorna configuração de gateways da empresa
 * PATCH /api/painel/gateways → salva configuração de gateways
 *
 * Requer migration 009 (009_gateways_evolution_pix.sql) aplicada.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const ALLOWED_ROLES = ["master", "admin", "gerente"];

const gatewaySchema = z.object({
  pix_tipo:       z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional().nullable(),
  pix_chave:      z.string().max(255).trim().optional().nullable(),
  pix_favorecido: z.string().max(200).trim().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED_ROLES.includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  try {
    const row = await queryOne<{
      pix_tipo:       string | null;
      pix_chave:      string | null;
      pix_favorecido: string | null;
    }>(
      `SELECT pix_tipo, pix_chave, pix_favorecido
       FROM empresas
       WHERE id = $1 AND deleted_at IS NULL`,
      [empresaId]
    );

    return ok({
      pix_tipo:       row?.pix_tipo       ?? null,
      pix_chave:      row?.pix_chave      ?? null,
      pix_favorecido: row?.pix_favorecido ?? null,
      // Placeholders para gateways futuros
      mp_public_key:   null,
      mp_access_token: null,
      ps_token:        null,
    });
  } catch (err) {
    console.error("[Gateways/GET]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED_ROLES.includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  let body: z.infer<typeof gatewaySchema>;
  try {
    body = gatewaySchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  const updates: Record<string, unknown> = {};
  if (body.pix_tipo       !== undefined) updates["pix_tipo"]       = body.pix_tipo;
  if (body.pix_chave      !== undefined) updates["pix_chave"]      = body.pix_chave;
  if (body.pix_favorecido !== undefined) updates["pix_favorecido"] = body.pix_favorecido;

  if (Object.keys(updates).length === 0) return ok({ updated: false });

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = [empresaId, ...Object.values(updates)];

    await queryOne(
      `UPDATE empresas SET ${setClauses}, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    return ok({ updated: true });
  } catch (err: unknown) {
    console.error("[Gateways/PATCH]", err);
    return serverError();
  }
}
