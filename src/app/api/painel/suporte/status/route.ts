/**
 * GET /api/painel/suporte/status
 *
 * Retorna se a empresa do JWT tem acesso ao módulo Suporte liberado pelo
 * master. Usado pelo /hub pra mostrar o card "Suporte" e pela página
 * /painel/suporte pra decidir se mostra unlock screen ou conteúdo.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;

  // Master e suporte sempre têm acesso (são equipe interna do SaaS)
  if (role === "master" || role === "suporte") {
    return ok({ liberado: true, master: true, duracao: "sempre", personalizado: false });
  }

  if (!empresaId) return forbidden();

  const row = await queryOne<{
    id: string; duracao: string;
    expira_em: string | null;
    personalizado: boolean;
    revogado_em: string | null;
  }>(
    `SELECT id, duracao,
            expira_em::text,
            personalizado,
            revogado_em::text
       FROM suporte_acessos
      WHERE empresa_id = $1
        AND revogado_em IS NULL
        AND (expira_em IS NULL OR expira_em > NOW())
      ORDER BY liberado_em DESC LIMIT 1`,
    [empresaId]
  ).catch(() => null);

  return ok({
    liberado:      !!row,
    master:        false,
    duracao:       row?.duracao ?? null,
    expira_em:     row?.expira_em ?? null,
    personalizado: row?.personalizado ?? false,
  });
}
