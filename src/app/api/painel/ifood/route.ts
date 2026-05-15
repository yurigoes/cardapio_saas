/**
 * GET  /api/painel/ifood   → lê config (sem secret)
 * PUT  /api/painel/ifood   → upsert config (admin/master)
 *   Body: { client_id, client_secret, merchant_id?, ambiente?, polling_ativo? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { encrypt } from "@/lib/security/encrypt";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const cfg = await queryOne(
      `SELECT id, client_id, merchant_id, ambiente, ativo, polling_ativo,
              ultimo_polling_em, ultimo_evento_id, ultimo_erro, ultimo_erro_em,
              token_expira_em, mode, authorized_em, auto_aceite
         FROM ifood_config WHERE empresa_id = $1`,
      [empresaId]
    ).catch(() => null);

    // Pega info se master configurou app distribuída.
    // Wrapped em catch — tabela pode não existir ainda (migration 053 pendente)
    const master = await queryOne<{ ativo: boolean; app_nome: string | null }>(
      `SELECT ativo, app_nome FROM saas_ifood_config WHERE id = 1`
    ).catch((err) => {
      console.warn("[Ifood/GET] saas_ifood_config indisponível:", err instanceof Error ? err.message : err);
      return null;
    });

    return ok({
      cfg: cfg ?? null,
      master_distribuido_disponivel: !!(master?.ativo),
      master_app_nome:               master?.app_nome ?? null,
    });
  } catch (err) {
    console.error("[Ifood/GET]", err);
    return serverError();
  }
}

const upsertSchema = z.object({
  client_id:     z.string().min(8).max(255),
  client_secret: z.string().min(8).max(500).optional(),  // opcional em update se já tem
  merchant_id:   z.string().max(255).optional(),
  ambiente:      z.enum(["sandbox", "producao"]).optional().default("producao"),
  ativo:         z.boolean().optional().default(true),
  polling_ativo: z.boolean().optional().default(false),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof upsertSchema>;
  try { body = upsertSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const existente = await queryOne<{ id: string }>(
      `SELECT id FROM ifood_config WHERE empresa_id = $1`,
      [empresaId]
    );

    const secretEncrypted = body.client_secret
      ? `encrypted:${encrypt(body.client_secret)}`
      : null;

    if (existente) {
      await queryOne(
        `UPDATE ifood_config SET
           client_id     = $1,
           client_secret = COALESCE($2, client_secret),
           merchant_id   = $3,
           ambiente      = $4,
           ativo         = $5,
           polling_ativo = $6,
           access_token  = NULL,    -- força renovação
           token_expira_em = NULL,
           updated_at    = NOW()
         WHERE empresa_id = $7`,
        [body.client_id, secretEncrypted, body.merchant_id ?? null,
         body.ambiente, body.ativo, body.polling_ativo, empresaId]
      );
    } else {
      if (!body.client_secret) return badRequest("client_secret obrigatório no primeiro setup");
      await queryOne(
        `INSERT INTO ifood_config
           (empresa_id, client_id, client_secret, merchant_id, ambiente, ativo, polling_ativo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [empresaId, body.client_id, secretEncrypted, body.merchant_id ?? null,
         body.ambiente, body.ativo, body.polling_ativo]
      );
    }

    return ok({ saved: true });
  } catch (err) {
    console.error("[Ifood/PUT]", err);
    return serverError();
  }
}
