/**
 * POST /api/auth/2fa/verify
 * Body: { secret, codigo }
 *
 * Confirma código TOTP pro secret recebido — se válido, persiste
 * (cifrado), gera 8 recovery codes, marca totp_enabled=true.
 *
 * Retorna recovery_codes em texto claro APENAS aqui (única chance —
 * depois ficam só hash no banco).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import {
  verificarCodigo, cifrarSecret,
  gerarRecoveryCodes, salvarRecoveryCodes,
} from "@/lib/auth/totp";

const schema = z.object({
  secret: z.string().min(16).max(64),
  codigo: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (!verificarCodigo(body.secret, body.codigo)) {
    return badRequest("Código inválido. Verifique o app authenticator e tente novamente.");
  }

  try {
    const cifrado = cifrarSecret(body.secret);
    await query(
      `UPDATE usuarios
          SET totp_secret    = $2,
              totp_enabled   = TRUE,
              totp_enabled_em = NOW()
        WHERE id = $1`,
      [auth.payload.sub, cifrado]
    );

    const codes = gerarRecoveryCodes(8);
    await salvarRecoveryCodes(auth.payload.sub, codes);

    return ok({
      ativado:        true,
      recovery_codes: codes,
      mensagem: "2FA ativado com sucesso. Salve os recovery codes em local seguro — não vão aparecer de novo.",
    });
  } catch (err) {
    console.error("[2FA/Verify]", err);
    return serverError();
  }
}
