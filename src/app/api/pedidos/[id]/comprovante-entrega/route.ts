/**
 * POST /api/pedidos/[id]/comprovante-entrega
 *
 * Body: { foto_url?, recebido_por?, observacoes? }
 *
 * Permite ao motoboy registrar comprovante de entrega:
 *   - foto_url (opcional): URL da imagem subida via /api/upload
 *   - recebido_por (opcional): nome de quem recebeu
 *   - observacoes (opcional)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  foto_url:     z.string().url().max(500).optional(),
  recebido_por: z.string().max(255).optional(),
  observacoes:  z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    let extra = "";
    const vals: unknown[] = [params.id, empresaId];
    if (role === "motoboy") {
      const m = await queryOne<{ id: string }>(
        `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2`,
        [sub, empresaId]
      );
      if (!m) return forbidden("Motoboy não vinculado");
      extra = " AND motoboy_id = $3";
      vals.push(m.id);
    }

    const r = await queryOne(
      `UPDATE pedidos SET
         entregue_foto_url     = COALESCE($${vals.length + 1}, entregue_foto_url),
         entregue_recebido_por = COALESCE($${vals.length + 2}, entregue_recebido_por),
         entregue_observacoes  = COALESCE($${vals.length + 3}, entregue_observacoes),
         updated_at            = NOW()
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL ${extra}
       RETURNING id`,
      [...vals, body.foto_url ?? null, body.recebido_por ?? null, body.observacoes ?? null]
    );
    if (!r) return notFound();
    return ok({ saved: true });
  } catch (err) {
    console.error("[Pedidos/Comprovante]", err);
    return serverError();
  }
}
