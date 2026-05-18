/**
 * GET /api/painel/rede
 * Retorna info da rede + lista de filiais (se empresa atual estiver em rede)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, serverError } from "@/lib/utils/response";
import { scopeAtual, listarFiliais } from "@/lib/rede/scope";
import { queryOne } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const scope = await scopeAtual(empresaId);
    if (!scope) return forbidden("Empresa não encontrada");

    // Se não tem rede, retorna scope vazio
    if (!scope.rede_id) {
      return ok({ scope, rede: null, filiais: [], pode_trocar: false });
    }

    const rede = await queryOne(
      `SELECT id, nome, cnpj_matriz, logo_url, cor_primaria,
              fidelidade_cross_filial, cardapio_sincronizado,
              desconto_progressivo_pct, plano_id, site, whatsapp, email_contato
         FROM redes WHERE id = $1 AND deleted_at IS NULL`,
      [scope.rede_id]
    );

    const filiais = await listarFiliais(scope.rede_id);

    // Usuário pode trocar filial?
    const usr = await queryOne<{ rede_id: string | null; opera_todas_filiais: boolean | null }>(
      `SELECT rede_id, COALESCE(opera_todas_filiais, FALSE) AS opera_todas_filiais
         FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    ).catch(() => null);
    const podeTrocar = (auth.payload.role === "master" || auth.payload.role === "suporte")
                    || (!!usr?.rede_id && !!usr.opera_todas_filiais);

    return ok({ scope, rede, filiais, pode_trocar: podeTrocar });
  } catch (err) {
    console.error("[Painel/Rede/GET]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
