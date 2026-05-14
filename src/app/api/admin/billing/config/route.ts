/**
 * GET   /api/admin/billing/config — config MP do master (cifrada na DB)
 * PATCH /api/admin/billing/config — atualiza
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { encrypt } from "@/lib/security/encrypt";
import { invalidarCacheMp } from "@/lib/billing/mercadopago";

interface CfgRow {
  mp_access_token:   string | null;
  mp_public_key:     string | null;
  mp_webhook_secret: string | null;
  ativo:             boolean;
  modo:              string;
  vencimento_dia:    number;
  juros_atraso_pct:  string | number;
  multa_atraso_pct:  string | number;
  ultimo_envio:      string | null;
  ultimo_status:     string | null;
  ultimo_erro:       string | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const r = await queryOne<CfgRow>(
      `SELECT mp_access_token, mp_public_key, mp_webhook_secret,
              ativo, modo, vencimento_dia, juros_atraso_pct, multa_atraso_pct,
              ultimo_envio, ultimo_status, ultimo_erro
         FROM saas_billing_config WHERE id = 1`
    );
    // Mascara tokens sensíveis
    if (r) {
      if (r.mp_access_token)   r.mp_access_token   = "********";
      if (r.mp_webhook_secret) r.mp_webhook_secret = "********";
    }
    return ok(r ?? {});
  } catch (err) {
    console.error("[Billing/Config/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  mp_access_token:   z.string().max(500).nullable().optional(),
  mp_public_key:     z.string().max(200).nullable().optional(),
  mp_webhook_secret: z.string().max(500).nullable().optional(),
  ativo:             z.boolean().optional(),
  modo:              z.enum(["sandbox", "producao"]).optional(),
  vencimento_dia:    z.number().int().min(1).max(28).optional(),
  juros_atraso_pct:  z.number().min(0).max(100).optional(),
  multa_atraso_pct:  z.number().min(0).max(100).optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // Mascarado = não sobrescreve
  const updates: Record<string, unknown> = { ...body };
  if (updates.mp_access_token === "********")   delete updates.mp_access_token;
  if (updates.mp_webhook_secret === "********") delete updates.mp_webhook_secret;

  // Cifra tokens
  try {
    if (typeof updates.mp_access_token === "string" && updates.mp_access_token.length > 0) {
      updates.mp_access_token = encrypt(updates.mp_access_token);
    }
    if (typeof updates.mp_webhook_secret === "string" && updates.mp_webhook_secret.length > 0) {
      updates.mp_webhook_secret = encrypt(updates.mp_webhook_secret);
    }
  } catch (err) {
    console.error("[Billing/Config/PATCH] encrypt:", err);
    return serverError("Falha ao cifrar token — verifique ENCRYPTION_KEY");
  }

  if (Object.keys(updates).length === 0) return badRequest("Nada para atualizar");

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values     = [auth.payload.sub, ...Object.values(updates)];
    await queryOne(
      `UPDATE saas_billing_config
          SET ${setClauses}, updated_by = $1, updated_at = NOW()
        WHERE id = 1`,
      values
    );
    invalidarCacheMp();
    return ok({ updated: true });
  } catch (err) {
    console.error("[Billing/Config/PATCH]", err);
    return serverError();
  }
}
