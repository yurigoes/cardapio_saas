/**
 * PATCH  /api/gateways/[id] — atualiza um gateway (toggle padrão, ativo, credenciais)
 * DELETE /api/gateways/[id] — soft delete
 *
 * Credenciais (api_key, client_secret, etc.) só são re-encriptadas se vierem
 * no body. Campos vazios/undefined preservam o valor existente.
 *
 * Toggle padrão: garante que apenas UM gateway por empresa fica padrao=true.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { encrypt } from "@/lib/security/encrypt";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const patchSchema = z.object({
  nome:           z.string().min(2).max(100).optional(),
  ativo:          z.boolean().optional(),
  padrao:         z.boolean().optional(),
  ambiente:       z.enum(["sandbox", "producao"]).optional(),
  client_id:      z.string().max(500).optional(),
  client_secret:  z.string().max(500).optional(),
  api_key:        z.string().max(500).optional(),
  token:          z.string().max(500).optional(),
  webhook_url:    z.string().url().optional().or(z.literal("")),
  webhook_secret: z.string().max(500).optional(),
  merchant_id:    z.string().max(255).optional(),
  configuracoes:  z.record(z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "gateway:configurar")) return forbidden();

  let body: z.output<typeof patchSchema>;
  try {
    const raw = await req.json();
    const r   = patchSchema.safeParse(raw);
    if (!r.success) {
      return badRequest(r.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    // Verifica que o gateway pertence à empresa
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM gateways_config
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!existing) return notFound("Gateway não encontrado");

    await transaction(async (client) => {
      const fields: Record<string, unknown> = {};
      if (body.nome           !== undefined) fields.nome         = body.nome;
      if (body.ativo          !== undefined) fields.ativo        = body.ativo;
      if (body.ambiente       !== undefined) fields.ambiente     = body.ambiente;
      if (body.merchant_id    !== undefined) fields.merchant_id  = body.merchant_id || null;
      if (body.webhook_url    !== undefined) fields.webhook_url  = body.webhook_url || null;
      if (body.configuracoes  !== undefined) fields.configuracoes = JSON.stringify(body.configuracoes);

      // Credenciais: encripta apenas se string não-vazia. "" mantém atual.
      if (body.client_id      && body.client_id.trim())     fields.client_id     = encrypt(body.client_id.trim());
      if (body.client_secret  && body.client_secret.trim()) fields.client_secret = encrypt(body.client_secret.trim());
      if (body.api_key        && body.api_key.trim())       fields.api_key       = encrypt(body.api_key.trim());
      if (body.token          && body.token.trim())         fields.token         = encrypt(body.token.trim());
      if (body.webhook_secret && body.webhook_secret.trim())fields.webhook_secret = encrypt(body.webhook_secret.trim());

      if (Object.keys(fields).length > 0) {
        const sets   = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
        const values = Object.values(fields);
        sets.push("updated_at = NOW()");
        values.push(params.id, empresaId);

        await client.query(
          `UPDATE gateways_config SET ${sets.join(", ")}
           WHERE id = $${values.length - 1} AND empresa_id = $${values.length}`,
          values
        );
      }

      // Toggle padrão: se está marcando como padrão, desmarca outros
      if (body.padrao === true) {
        await client.query(
          `UPDATE gateways_config SET padrao = FALSE
           WHERE empresa_id = $1 AND id <> $2`,
          [empresaId, params.id]
        );
        await client.query(
          `UPDATE gateways_config SET padrao = TRUE, updated_at = NOW()
           WHERE id = $1 AND empresa_id = $2`,
          [params.id, empresaId]
        );
      } else if (body.padrao === false) {
        await client.query(
          `UPDATE gateways_config SET padrao = FALSE, updated_at = NOW()
           WHERE id = $1 AND empresa_id = $2`,
          [params.id, empresaId]
        );
      }
    });

    return ok({ id: params.id, updated: true });
  } catch (err) {
    console.error("[Gateways/PATCH]", err);
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
  if (!temPermissao(role, "gateway:configurar")) return forbidden();

  try {
    const result = await queryOne<{ id: string }>(
      `UPDATE gateways_config
         SET deleted_at = NOW(), ativo = FALSE, padrao = FALSE
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [params.id, empresaId]
    );

    if (!result) return notFound("Gateway não encontrado");
    return ok({ deleted: true });
  } catch (err) {
    console.error("[Gateways/DELETE]", err);
    return serverError();
  }
}
