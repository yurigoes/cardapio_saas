/**
 * GET /api/painel/bloqueio
 * Cliente consulta status de bloqueio por inadimplência.
 * Layout do painel checa ao logar — se bloqueada, redireciona admin pra /painel/pagamentos
 * e bloqueia operadores comuns mostrando mensagem.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok } from "@/lib/utils/response";
import { checarInadimplencia } from "@/lib/billing/bloqueio";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return ok({ bloqueada: false });

  const status = await checarInadimplencia(empresaId);
  return ok(status);
}
