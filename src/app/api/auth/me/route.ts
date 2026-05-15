import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const usuario = await queryOne<{
      id:        string;
      nome:      string;
      email:     string;
      role:      string;
      empresa_id: string | null;
      avatar_url: string | null;
      ativo:     boolean;
      ultimo_login: Date | null;
    }>(
      `SELECT id, nome, email, role, empresa_id, avatar_url, ativo, ultimo_login
       FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );

    let empresa = null;
    if (auth.payload.empresaId) {
      empresa = await queryOne<{
        id:           string;
        nome_fantasia: string;
        slug:         string;
        logo_url:     string | null;
        status:       string;
        modulos_ativos: string[];
        exige_agente_terminal: boolean;
      }>(
        `SELECT id, nome_fantasia, slug, logo_url, status, modulos_ativos,
                COALESCE(exige_agente_terminal, false) AS exige_agente_terminal
         FROM empresas WHERE id = $1`,
        [auth.payload.empresaId]
      );
    }

    return ok({ usuario, empresa });
  } catch (err) {
    console.error("[Auth/Me]", err);
    return serverError();
  }
}
