/**
 * POST /api/sync/kiosk-frame
 *
 * Auth: Authorization: Bearer rdt_<token>
 * Body: { data: "data:image/png;base64,...", w?: number, h?: number }
 *
 * Recebe screenshot do kiosk e salva como último frame. Limite ~400KB
 * pra evitar saturar o banco.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { extractAgentToken, sha256 } from "@/lib/agentes/token";

const MAX_LEN = 600_000;   // ~450KB de base64

const schema = z.object({
  data: z.string().min(50).max(MAX_LEN).regex(/^data:image\/(png|jpeg|webp);base64,/, "Imagem inválida"),
  w:    z.number().int().positive().max(8000).optional(),
  h:    z.number().int().positive().max(8000).optional(),
});

export async function POST(req: NextRequest) {
  const token = extractAgentToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 401 });

  const tokenHash = sha256(token);
  const agente = await queryOne<{ id: string; tipo: string }>(
    `SELECT id, tipo FROM agentes
      WHERE token_hash = $1 AND ativo = true AND deleted_at IS NULL`,
    [tokenHash]
  ).catch(() => null);
  if (!agente) return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Body inválido",
    }, { status: 400 });
  }

  await queryOne(
    `UPDATE agentes
        SET ultimo_frame_data = $1,
            ultimo_frame_em   = NOW(),
            frame_w           = $2,
            frame_h           = $3,
            ultimo_hb_em      = NOW(),
            primeiro_hb_em    = COALESCE(primeiro_hb_em, NOW()),
            status            = 'online',
            updated_at        = NOW()
      WHERE id = $4`,
    [body.data, body.w ?? null, body.h ?? null, agente.id]
  );

  return NextResponse.json({ ok: true, next_in_sec: 8 });
}
