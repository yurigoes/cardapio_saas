/**
 * PATCH /api/admin/dominios/[id] — Aprova ou rejeita domínio personalizado
 *
 * Ao aprovar:
 *  1. Atualiza `dominio_status = 'aprovado'` no DB
 *  2. Regenera /opt/cardapio/infra/traefik/dynamic/custom-domains.yml
 *  3. Traefik detecta a mudança automaticamente (file watch)
 *
 * Requer: role = 'master'
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { rewriteCustomDomains } from "@/lib/traefik/custom-domains";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.payload.role !== "master") {
    return forbidden("Somente master pode aprovar domínios");
  }

  let body: { acao: "aprovar" | "rejeitar"; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  if (!["aprovar","rejeitar"].includes(body.acao)) {
    return badRequest("acao deve ser 'aprovar' ou 'rejeitar'");
  }

  try {
    const empresa = await queryOne<{
      id: string; slug: string; dominio_proprio: string | null;
    }>(
      `SELECT id, slug, dominio_proprio
       FROM empresas
       WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );

    if (!empresa) return notFound("Empresa não encontrada");
    if (!empresa.dominio_proprio) return badRequest("Empresa não tem domínio personalizado");

    const novoStatus = body.acao === "aprovar" ? "aprovado" : "rejeitado";

    await queryOne(
      `UPDATE empresas
       SET dominio_status = $1, updated_at = NOW()
       WHERE id = $2`,
      [novoStatus, params.id]
    );

    // Se aprovado, regenera arquivo do Traefik
    if (body.acao === "aprovar") {
      await rewriteCustomDomains();
    }

    return ok({
      id:     params.id,
      status: novoStatus,
      dominio: empresa.dominio_proprio,
    });
  } catch (err) {
    console.error("[Admin/Dominios/PATCH]", err);
    return serverError();
  }
}
