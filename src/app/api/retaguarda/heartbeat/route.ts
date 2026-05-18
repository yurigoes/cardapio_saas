/**
 * POST /api/retaguarda/heartbeat
 *
 * Endpoint chamado pela retaguarda a cada 60s.
 * Atualiza/cria registro em `retaguardas` + grava IP público.
 *
 * Auth: header x-retaguarda-secret == env RETAGUARDA_HEARTBEAT_SECRET.
 * Body: { empresa_slug, retaguarda_id, versao?, metricas? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { getClientIp } from "@/lib/auth/middleware";

const schema = z.object({
  empresa_slug:  z.string().min(1),
  retaguarda_id: z.string().uuid(),
  versao:        z.string().optional(),
  metricas:      z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.RETAGUARDA_HEARTBEAT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "RETAGUARDA_HEARTBEAT_SECRET não configurado" },
      { status: 500 }
    );
  }
  if (req.headers.get("x-retaguarda-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 }); }

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL`,
      [body.empresa_slug]
    );

    const ip     = getClientIp(req);
    const origem = req.headers.get("x-retaguarda-origin") ?? null;

    await queryOne(
      `INSERT INTO retaguardas
         (retaguarda_id, empresa_id, empresa_slug, dominio, ip_publico,
          versao, metricas, ultimo_heartbeat, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), TRUE)
       ON CONFLICT (retaguarda_id)
       DO UPDATE SET
         empresa_id       = EXCLUDED.empresa_id,
         empresa_slug     = EXCLUDED.empresa_slug,
         dominio          = COALESCE(EXCLUDED.dominio, retaguardas.dominio),
         ip_publico       = EXCLUDED.ip_publico,
         versao           = EXCLUDED.versao,
         metricas         = EXCLUDED.metricas,
         ultimo_heartbeat = NOW(),
         ativo            = TRUE,
         updated_at       = NOW()`,
      [
        body.retaguarda_id,
        empresa?.id ?? null,
        body.empresa_slug,
        origem,
        ip === "unknown" ? null : ip,
        body.versao ?? null,
        JSON.stringify(body.metricas ?? {}),
      ]
    );

    return NextResponse.json({ ok: true, server_time: new Date().toISOString() });
  } catch (err) {
    console.error("[retaguarda/heartbeat]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
