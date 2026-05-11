import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { revogarSessao } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/security/audit";
import { ok, serverError } from "@/lib/utils/response";
import { getClientIp } from "@/lib/auth/middleware";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    await revogarSessao(auth.payload.sessionId);

    await logSecurityEvent({
      tipo:      "logout",
      ipAddress: getClientIp(req),
      usuarioId: auth.payload.sub,
      empresaId: auth.payload.empresaId,
    });

    return ok({ message: "Logout realizado com sucesso" });
  } catch (err) {
    console.error("[Auth/Logout]", err);
    return serverError();
  }
}
