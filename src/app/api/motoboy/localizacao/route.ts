/**
 * POST /api/motoboy/localizacao
 * Body: { lat, lng, precisao_m?, velocidade?, bateria?, pedido_id? }
 *
 * Recebe ping de localização do motoboy (chamado periodicamente pelo PWA).
 * Atualiza motoboys.lat_atual/lng_atual + grava em motoboy_localizacoes.
 *
 * Auth: usuario com role=motoboy. Vínculo motoboys.usuario_id obrigatório.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

// Coerções tolerantes — PWA pode mandar string em vez de number,
// e pedido_id como "" (string vazia) em vez de undefined.
const bodySchema = z.object({
  lat:        z.coerce.number().min(-90).max(90),
  lng:        z.coerce.number().min(-180).max(180),
  precisao_m: z.coerce.number().min(0).max(10000).optional().nullable(),
  velocidade: z.coerce.number().min(0).max(300).optional().nullable(),
  bateria:    z.coerce.number().min(0).max(100).optional().nullable(),
  pedido_id:  z.preprocess(
    v => (v === "" || v == null ? undefined : v),
    z.string().uuid().optional()
  ),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (role !== "motoboy" && role !== "admin" && role !== "master") {
    return forbidden("Apenas motoboy");
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const motoboy = await queryOne<{ id: string }>(
      `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2`,
      [sub, empresaId]
    );
    if (!motoboy) return forbidden("Motoboy não vinculado a este usuário");

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO motoboy_localizacoes
           (motoboy_id, empresa_id, pedido_id, lat, lng, precisao_m, velocidade, bateria)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          motoboy.id, empresaId, body.pedido_id ?? null,
          body.lat, body.lng,
          body.precisao_m ?? null,
          body.velocidade ?? null,
          body.bateria    ?? null,
        ]
      );
      await client.query(
        `UPDATE motoboys
            SET lat_atual = $1, lng_atual = $2, localizado_em = NOW()
          WHERE id = $3`,
        [body.lat, body.lng, motoboy.id]
      );
    });

    return ok({ saved: true });
  } catch (err) {
    console.error("[Motoboy/Localizacao]", err);
    return serverError();
  }
}
