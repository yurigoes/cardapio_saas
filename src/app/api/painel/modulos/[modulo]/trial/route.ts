/**
 * POST /api/painel/modulos/[modulo]/trial
 *
 * Cria trial de 7 dias do módulo. Falha se a empresa já usou trial dele.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, conflict } from "@/lib/utils/response";
import { MODULOS } from "../../route";

export async function POST(
  req: NextRequest,
  { params }: { params: { modulo: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master", "admin", "gerente"].includes(auth.payload.role)) {
    return forbidden("Apenas master/admin/gerente podem ativar trial");
  }
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden("Empresa não identificada");

  const modulo = params.modulo;
  if (!MODULOS.find(m => m.key === modulo)) {
    return badRequest(`Módulo desconhecido: ${modulo}`);
  }

  try {
    // INSERT que falha se já existe (UNIQUE empresa_id, modulo)
    const r = await queryOne<{ id: string; expira_em: string }>(
      `INSERT INTO modulo_trials (empresa_id, modulo, criado_por)
       VALUES ($1, $2, $3)
       ON CONFLICT (empresa_id, modulo) DO NOTHING
       RETURNING id, expira_em`,
      [empresaId, modulo, sub]
    );

    if (!r) {
      return conflict("Trial deste módulo já foi utilizado anteriormente. Compre à la carte pra continuar usando.");
    }

    return ok({
      modulo,
      expira_em: r.expira_em,
      mensagem:  "Trial de 7 dias ativado!",
    });
  } catch (err) {
    console.error("[Painel/Modulos/Trial]", err);
    return serverError();
  }
}
