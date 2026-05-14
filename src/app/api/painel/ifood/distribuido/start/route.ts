/**
 * POST /api/painel/ifood/distribuido/start
 *
 * Inicia fluxo userCode iFood:
 * 1. Pega clientId do master
 * 2. Chama POST /oauth/userCode → recebe userCode + verificationUrlComplete + verifier
 * 3. Salva verifier em ifood_config (temp) pra usar no /connect
 * 4. Devolve UI com URL+code pra usuário autorizar no portal
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { getMasterIfoodConfig, requestUserCode } from "@/lib/ifood/client";

const ALLOWED = ["master", "admin"];

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  // Verifica master
  const master = await getMasterIfoodConfig();
  if (!master) {
    return badRequest(
      "App iFood Distribuído não configurado pelo master. " +
      "Master precisa configurar em /admin/ifood antes."
    );
  }

  try {
    const r = await requestUserCode(master.client_id);

    // Garante linha em ifood_config (cria se não existe)
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM ifood_config WHERE empresa_id = $1`,
      [empresaId]
    );

    if (existing) {
      await queryOne(
        `UPDATE ifood_config
            SET mode = 'distribuido',
                authorization_code_verifier = $2,
                userCode_em = NOW(),
                ativo = true,
                client_id = $3,         -- placeholder (master é a real, mas valida não-nulo)
                client_secret = $3,     -- idem
                updated_at = NOW()
          WHERE empresa_id = $1`,
        [empresaId, r.authorizationCodeVerifier, "distribuido_master"]
      );
    } else {
      await queryOne(
        `INSERT INTO ifood_config
           (empresa_id, mode, client_id, client_secret, ambiente, ativo,
            polling_ativo, authorization_code_verifier, userCode_em)
         VALUES ($1, 'distribuido', 'distribuido_master', 'distribuido_master',
                 'producao', true, false, $2, NOW())`,
        [empresaId, r.authorizationCodeVerifier]
      );
    }

    // Atualiza telemetria do master
    await queryOne(
      `UPDATE saas_ifood_config SET ultimo_userCode_em = NOW() WHERE id = 1`
    ).catch(() => {});

    return ok({
      user_code:                  r.userCode,
      verification_url_complete:  r.verificationUrlComplete,
      verification_url:           r.verificationUrl,
      expires_in:                 r.expiresIn,
      mensagem: "Acesse o link, faça login com a conta da loja, autorize a app e copie o 'authorization code' que aparecerá. Depois cole aqui pra finalizar.",
    });
  } catch (err) {
    console.error("[Ifood/Distribuido/Start]", err);
    return serverError(err instanceof Error ? err.message : "?");
  }
}
