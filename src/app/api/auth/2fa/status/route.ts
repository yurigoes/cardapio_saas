/**
 * GET /api/auth/2fa/status
 *
 * Devolve estado do 2FA do usuário logado: ativo? quantos recovery codes
 * sobraram? quando foi ativado?
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, serverError } from "@/lib/utils/response";
import { recoveryCodesRestantes } from "@/lib/auth/totp";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const u = await queryOne<{
      totp_enabled: boolean;
      totp_enabled_em: string | null;
      totp_ultimo_uso: string | null;
    }>(
      `SELECT totp_enabled, totp_enabled_em, totp_ultimo_uso
         FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );
    const restantes = u?.totp_enabled ? await recoveryCodesRestantes(auth.payload.sub) : 0;

    return ok({
      ativo:                u?.totp_enabled ?? false,
      ativado_em:           u?.totp_enabled_em ?? null,
      ultimo_uso:           u?.totp_ultimo_uso ?? null,
      recovery_codes_restantes: restantes,
    });
  } catch (err) {
    console.error("[2FA/Status]", err);
    return serverError();
  }
}
