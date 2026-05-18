/**
 * GET  /api/admin/cloudflare-setup   — status + account_id + zone_id (sem token)
 * POST /api/admin/cloudflare-setup   — { api_token, account_id, zone_id, base_domain? }
 *                                      Valida contra CF API, cifra e salva.
 * DELETE /api/admin/cloudflare-setup — limpa config
 *
 * Auth: master.
 *
 * Permissões necessárias do token CF:
 *  - Account → Cloudflare Tunnel → Edit
 *  - Zone → DNS → Edit (zona base_domain)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { encrypt } from "@/lib/security/encrypt";
import { ok, badRequest, forbidden, serverError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  api_token: string | null;
  account_id: string | null;
  zone_id: string | null;
  base_domain: string | null;
  ativo: boolean;
  validado_em: string | null;
  validado_ok: boolean | null;
  validado_erro: string | null;
}

async function masterOnly(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return { err: auth as ReturnType<typeof forbidden> };
  if (auth.payload.role !== "master") return { err: forbidden("Acesso exclusivo master") };
  return { ok: true as const };
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const a = await masterOnly(req);
  if ("err" in a) return a.err;

  const row = await queryOne<Row>(
    `SELECT id, api_token, account_id, zone_id, base_domain, ativo,
            validado_em, validado_ok, validado_erro
       FROM master_cloudflare_config WHERE id = 1`
  ).catch(() => null);

  return ok({
    configured:    !!(row?.api_token && row?.account_id && row?.zone_id),
    account_id:    row?.account_id ?? null,
    zone_id:       row?.zone_id ?? null,
    base_domain:   row?.base_domain ?? "tthreedigital.com.br",
    ativo:         row?.ativo ?? true,
    validado_em:   row?.validado_em ?? null,
    validado_ok:   row?.validado_ok ?? null,
    validado_erro: row?.validado_erro ?? null,
    // token NÃO é retornado
  });
}

// ── POST ────────────────────────────────────────────────────────────────────
const setupSchema = z.object({
  api_token:   z.string().min(20, "token muito curto"),
  account_id:  z.string().regex(/^[a-f0-9]{32}$/i, "account_id deve ter 32 hex"),
  zone_id:     z.string().regex(/^[a-f0-9]{32}$/i, "zone_id deve ter 32 hex"),
  base_domain: z.string().regex(/^[a-z0-9.-]+$/i).default("tthreedigital.com.br"),
});

export async function POST(req: NextRequest) {
  const a = await masterOnly(req);
  if ("err" in a) return a.err;

  let body: z.infer<typeof setupSchema>;
  try { body = setupSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "body inválido"); }

  // 1. Valida token contra CF API
  let validacaoOk = false;
  let validacaoErro: string | null = null;

  try {
    const verifyResp = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${body.api_token}` },
      signal:  AbortSignal.timeout(8000),
    });
    const verify = await verifyResp.json();
    if (!verify?.success) {
      validacaoErro = `Token inválido: ${JSON.stringify(verify?.errors ?? verify)}`;
      return badRequest(validacaoErro);
    }

    // Confere acesso à zona
    const zoneResp = await fetch(`https://api.cloudflare.com/client/v4/zones/${body.zone_id}`, {
      headers: { Authorization: `Bearer ${body.api_token}` },
      signal:  AbortSignal.timeout(8000),
    });
    const zone = await zoneResp.json();
    if (!zone?.success) {
      validacaoErro = `Zone ID inválido ou sem acesso: ${JSON.stringify(zone?.errors ?? zone)}`;
      return badRequest(validacaoErro);
    }

    // Confere account
    const accResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${body.account_id}`, {
      headers: { Authorization: `Bearer ${body.api_token}` },
      signal:  AbortSignal.timeout(8000),
    });
    const acc = await accResp.json();
    if (!acc?.success) {
      validacaoErro = `Account ID inválido ou sem acesso: ${JSON.stringify(acc?.errors ?? acc)}`;
      return badRequest(validacaoErro);
    }

    validacaoOk = true;
  } catch (err) {
    validacaoErro = err instanceof Error ? err.message : "erro de rede ao validar";
    return badRequest(`Falha ao validar contra Cloudflare: ${validacaoErro}`);
  }

  // 2. Cifra e grava
  try {
    const tokenCifrado = `encrypted:${encrypt(body.api_token)}`;

    await queryOne(
      `INSERT INTO master_cloudflare_config
         (id, api_token, account_id, zone_id, base_domain, ativo,
          validado_em, validado_ok, validado_erro, updated_at)
       VALUES (1, $1, $2, $3, $4, TRUE, NOW(), $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         api_token     = EXCLUDED.api_token,
         account_id    = EXCLUDED.account_id,
         zone_id       = EXCLUDED.zone_id,
         base_domain   = EXCLUDED.base_domain,
         ativo         = TRUE,
         validado_em   = NOW(),
         validado_ok   = EXCLUDED.validado_ok,
         validado_erro = EXCLUDED.validado_erro,
         updated_at    = NOW()`,
      [tokenCifrado, body.account_id, body.zone_id, body.base_domain, validacaoOk, validacaoErro]
    );

    return ok({
      configured:  true,
      validado_ok: validacaoOk,
      base_domain: body.base_domain,
      mensagem:    "Config Cloudflare salva. Próximas instalações de retaguarda vão usar automaticamente.",
    });
  } catch (err) {
    console.error("[admin/cloudflare-setup/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const a = await masterOnly(req);
  if ("err" in a) return a.err;

  await queryOne(
    `UPDATE master_cloudflare_config
        SET api_token = NULL, account_id = NULL, zone_id = NULL,
            ativo = FALSE, validado_ok = FALSE,
            updated_at = NOW()
      WHERE id = 1`
  ).catch(() => null);

  return ok({ configured: false });
}
