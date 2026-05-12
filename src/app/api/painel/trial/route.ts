/**
 * GET /api/painel/trial
 *
 * Retorna info de trial da empresa logada (para banner no /painel).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, notFound, badRequest } from "@/lib/utils/response";
import { getTrialInfo } from "@/lib/billing/trial";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const empresaId = auth.payload.empresaId;
  if (!empresaId) return badRequest("Sem empresa associada");

  const info = await getTrialInfo(empresaId);
  if (!info) return notFound("Empresa não encontrada");
  return ok(info);
}
