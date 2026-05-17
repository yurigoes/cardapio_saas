/**
 * GET /api/painel/empresa/modulos-extras → lista módulos extras da empresa do usuário logado
 *
 * Usado pelo frontend pra renderizar coroinha 👑 ao lado do nome do módulo.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return ok([]);

  try {
    const rows = await query(
      `SELECT modulo, tipo, expira_em, bloqueado
         FROM empresa_modulos_extras
        WHERE empresa_id = $1
          AND bloqueado = FALSE
          AND (expira_em IS NULL OR expira_em > NOW())`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[Empresa/Extras/GET]", err);
    return serverError();
  }
}
