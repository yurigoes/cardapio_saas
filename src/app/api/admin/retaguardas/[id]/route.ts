/**
 * GET    /api/admin/retaguardas/[id]  — detalhes (com métricas atuais)
 * DELETE /api/admin/retaguardas/[id]  — desativa (não deleta linha)
 *
 * O id da URL é o id INTERNO da tabela (UUID PK), não o retaguarda_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Acesso exclusivo master");

  try {
    const r = await queryOne<{
      id: string; retaguarda_id: string;
      empresa_id: string | null;
      empresa_slug: string; dominio: string | null;
      ip_publico: string | null; versao: string | null;
      primeira_vez: string; ultimo_heartbeat: string; ativo: boolean;
      metricas: Record<string, unknown>;
      segundos_desde: number;
    }>(
      `SELECT id, retaguarda_id, empresa_id, empresa_slug, dominio,
              ip_publico::text AS ip_publico, versao, primeira_vez,
              ultimo_heartbeat, ativo, metricas,
              EXTRACT(EPOCH FROM (NOW() - ultimo_heartbeat))::int AS segundos_desde
         FROM retaguardas WHERE id = $1`,
      [params.id]
    );
    if (!r) return notFound("Retaguarda não encontrada");

    return ok({
      ...r,
      online: r.segundos_desde < 180,
      label_status: r.segundos_desde < 90 ? "online"
                  : r.segundos_desde < 180 ? "instavel" : "offline",
    });
  } catch (err) {
    console.error("[admin/retaguardas/GET]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Acesso exclusivo master");

  try {
    const r = await queryOne<{ id: string }>(
      `UPDATE retaguardas SET ativo = FALSE, updated_at = NOW()
        WHERE id = $1 RETURNING id`,
      [params.id]
    );
    if (!r) return notFound("Retaguarda não encontrada");
    return ok({ id: r.id, ativo: false });
  } catch (err) {
    console.error("[admin/retaguardas/DELETE]", err);
    return serverError();
  }
}
