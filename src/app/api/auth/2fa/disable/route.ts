/**
 * POST /api/auth/2fa/disable
 * Body: { senha }   // pra confirmação
 *
 * Desativa 2FA. Exige senha do usuário pra impedir que alguém com sessão
 * roubada desabilite o segundo fator.
 *
 * Apaga totp_secret + recovery_codes + invalida sessões existentes.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import bcrypt from "bcryptjs";

const schema = z.object({
  senha: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const u = await queryOne<{ senha_hash: string }>(
      `SELECT senha_hash FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );
    if (!u) return forbidden("Usuário não encontrado");

    const ok_ = await bcrypt.compare(body.senha, u.senha_hash);
    if (!ok_) return badRequest("Senha incorreta");

    await query(
      `UPDATE usuarios
          SET totp_secret = NULL, totp_enabled = FALSE,
              totp_enabled_em = NULL, totp_ultimo_uso = NULL
        WHERE id = $1`,
      [auth.payload.sub]
    );
    await query(
      `DELETE FROM totp_recovery_codes WHERE usuario_id = $1`,
      [auth.payload.sub]
    );
    // Invalida outras sessões (mantém a atual pra não kickar o usuário)
    await query(
      `UPDATE sessoes SET revoked_at = NOW()
        WHERE usuario_id = $1 AND id != $2 AND revoked_at IS NULL`,
      [auth.payload.sub, auth.payload.sessionId ?? ""]
    ).catch(() => {});

    return ok({ desativado: true, mensagem: "2FA desativado. Outras sessões foram invalidadas." });
  } catch (err) {
    console.error("[2FA/Disable]", err);
    return serverError();
  }
}
