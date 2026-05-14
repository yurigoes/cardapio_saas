/**
 * POST /api/auth/2fa/setup
 *
 * Gera novo TOTP secret + QR code pra ativação. NÃO persiste — só retorna
 * pra UI mostrar QR. Usuário precisa chamar /api/auth/2fa/verify com
 * código válido pra realmente ativar.
 *
 * Body: vazio.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError, conflict } from "@/lib/utils/response";
import { gerarSecret, otpauthUrl, gerarQrCodeDataUrl } from "@/lib/auth/totp";
import { getSaasBranding } from "@/lib/branding/server";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const u = await queryOne<{ email: string; totp_enabled: boolean }>(
      `SELECT email, totp_enabled FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );
    if (!u) return forbidden("Usuário não encontrado");
    if (u.totp_enabled) return conflict("2FA já está ativo. Desative antes de configurar novamente.");

    const branding = await getSaasBranding();
    const secret    = gerarSecret();
    const otpauthUri = otpauthUrl({
      secret,
      email:  u.email,
      issuer: branding.nome,
    });
    const qrDataUrl = await gerarQrCodeDataUrl(otpauthUri);

    return ok({
      secret,
      otpauth_uri: otpauthUri,
      qr_data_url: qrDataUrl,
      mensagem: "Escaneie o QR no Google Authenticator/Authy/1Password e digite o código de 6 dígitos pra confirmar.",
    });
  } catch (err) {
    console.error("[2FA/Setup]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
