/**
 * DELETE /api/admin/suporte/acessos/[id] — revoga acesso
 *   Body opcional: { motivo?: string }
 *
 * Master only.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let motivo: string | null = null;
  try {
    const b = await req.json().catch(() => ({}));
    motivo = typeof b.motivo === "string" ? b.motivo.slice(0, 200) : null;
  } catch {/* */}

  try {
    const r = await queryOne<{ id: string }>(
      `UPDATE suporte_acessos
          SET revogado_em      = NOW(),
              revogado_por     = $1,
              motivo_revogacao = $2,
              updated_at       = NOW()
        WHERE id = $3 AND revogado_em IS NULL
        RETURNING id`,
      [auth.payload.sub, motivo, params.id]
    );
    if (!r) return notFound("Acesso não encontrado ou já revogado");
    return ok({ revogado: true });
  } catch (err) {
    console.error("[Admin/Suporte/DELETE]", err);
    return serverError();
  }
}
