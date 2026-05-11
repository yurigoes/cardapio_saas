import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { gatewayConfigSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { encrypt } from "@/lib/security/encrypt";
import { ok, created, forbidden, badRequest, conflict, serverError } from "@/lib/utils/response";
import { isDuplicateKeyError } from "@/lib/utils/errors";
import { GATEWAYS_INFO } from "@/lib/gateways/registry";

// GET /api/gateways — Lista gateways da empresa
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "gateway:ver")) return forbidden();

  const gateways = await query(
    `SELECT id, nome, slug, merchant_id, webhook_url, ambiente,
            configuracoes, ativo, padrao, created_at
     FROM gateways_config
     WHERE empresa_id = $1 AND deleted_at IS NULL
     ORDER BY padrao DESC, nome`,
    [empresaId]
  );

  // Nunca retorna campos sensíveis descriptografados
  return ok({ gateways, disponiveis: GATEWAYS_INFO });
}

// POST /api/gateways — Adiciona gateway
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "gateway:configurar")) return forbidden();

  let body: z.output<typeof gatewayConfigSchema>;
  try {
    body = await parseBodyOrThrow(req, gatewayConfigSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const gateway = await queryOne<{ id: string }>(
      `INSERT INTO gateways_config
         (empresa_id, nome, slug, client_id, client_secret, api_key,
          merchant_id, token, webhook_url, ambiente, configuracoes, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        empresaId,
        body.nome,
        body.slug,
        body.client_id     ? encrypt(body.client_id)     : null,
        body.client_secret ? encrypt(body.client_secret) : null,
        body.api_key       ? encrypt(body.api_key)       : null,
        body.merchant_id   || null,
        body.token         ? encrypt(body.token)         : null,
        body.webhook_url   || null,
        body.ambiente,
        JSON.stringify(body.configuracoes),
        body.ativo,
      ]
    );

    return created({ id: gateway?.id });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return conflict(`Gateway '${body.slug}' já está cadastrado`);
    }
    console.error("[Gateways/POST]", err);
    return serverError();
  }
}
