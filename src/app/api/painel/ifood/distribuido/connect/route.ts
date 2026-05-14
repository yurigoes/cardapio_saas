/**
 * POST /api/painel/ifood/distribuido/connect
 * Body: { authorization_code: string }
 *
 * Finaliza fluxo userCode:
 * 1. Pega authorization_code_verifier salvo no /start
 * 2. Chama POST /oauth/token com grantType=authorization_code
 * 3. Recebe accessToken + refreshToken
 * 4. Salva refreshToken cifrado em ifood_config
 * 5. Habilita polling
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import {
  getMasterIfoodConfig, exchangeAuthorizationCode, encryptField,
} from "@/lib/ifood/client";

const ALLOWED = ["master", "admin"];

const schema = z.object({
  authorization_code: z.string().min(8).max(500),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // Master ativo?
  const master = await getMasterIfoodConfig();
  if (!master) return badRequest("Master iFood não configurado");

  // Pega verifier salvo
  const cfg = await queryOne<{ id: string; authorization_code_verifier: string | null; userCode_em: string | null }>(
    `SELECT id, authorization_code_verifier, userCode_em
       FROM ifood_config WHERE empresa_id = $1`,
    [empresaId]
  );
  if (!cfg || !cfg.authorization_code_verifier) {
    return badRequest("Fluxo userCode não iniciado. Clique 'Conectar com iFood' primeiro.");
  }

  // Verifier expira em 10min — checa
  if (cfg.userCode_em) {
    const idade = Date.now() - new Date(cfg.userCode_em).getTime();
    if (idade > 10 * 60_000) {
      return badRequest("Código expirado (passou de 10 min). Clique 'Conectar com iFood' de novo.");
    }
  }

  try {
    const tok = await exchangeAuthorizationCode(
      master.client_id,
      master.client_secret,
      body.authorization_code.trim(),
      cfg.authorization_code_verifier,
    );

    if (!tok.refreshToken) {
      return serverError("iFood não devolveu refresh_token (esperado em fluxo distribuído)");
    }

    const expira = new Date(Date.now() + (tok.expiresIn ?? 21600) * 1000);

    await query(
      `UPDATE ifood_config
          SET refresh_token  = $1,
              access_token   = $2,
              token_expira_em = $3,
              authorization_code_verifier = NULL,
              authorized_em  = NOW(),
              authorized_por = $4,
              polling_ativo  = true,
              ativo          = true,
              ultimo_erro    = NULL,
              ultimo_erro_em = NULL,
              updated_at     = NOW()
        WHERE id = $5`,
      [encryptField(tok.refreshToken), tok.accessToken, expira.toISOString(), sub, cfg.id]
    );

    return ok({
      conectado:        true,
      access_token_preview: tok.accessToken.slice(0, 20) + "...",
      expires_in:       tok.expiresIn,
      mensagem: "✓ Conectado! iFood vai começar a enviar pedidos automaticamente. Polling ativo.",
    });
  } catch (err) {
    console.error("[Ifood/Distribuido/Connect]", err);
    return serverError(err instanceof Error ? err.message : "?");
  }
}
