import { NextRequest } from "next/server";
import { verifyAccessToken, extractBearerToken, TokenPayload } from "./jwt";
import { isSessaoValida } from "./session";
import { unauthorized } from "@/lib/utils/response";

export async function requireAuth(
  req: NextRequest
): Promise<{ payload: TokenPayload } | ReturnType<typeof unauthorized>> {
  const token = extractBearerToken(req.headers.get("authorization"));

  if (!token) {
    return unauthorized("Token de acesso não fornecido");
  }

  let payload: TokenPayload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return unauthorized("Token inválido ou expirado");
  }

  // Verifica se sessão não foi revogada
  const valid = await isSessaoValida(payload.sessionId);
  if (!valid) {
    return unauthorized("Sessão encerrada. Faça login novamente");
  }

  return { payload };
}

export function isAuthError(result: unknown): result is ReturnType<typeof unauthorized> {
  return result !== null && typeof result === "object" && "status" in (result as object);
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
