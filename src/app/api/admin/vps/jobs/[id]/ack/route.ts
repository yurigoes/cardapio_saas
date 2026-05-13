/**
 * POST /api/admin/vps/jobs/[id]/ack
 * Body: { sucesso, resultado?, erro?, duracao_ms? }
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { queryOne } from "@/lib/db/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ ok: false }, { status: 401 });
  const key  = auth.slice(7).trim();
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const a = await queryOne(
    `SELECT id FROM vps_agents WHERE agent_key_hash = $1 AND ativo = true`,
    [hash]
  );
  if (!a) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { sucesso?: boolean; resultado?: unknown; erro?: string; duracao_ms?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  await queryOne(
    `UPDATE vps_jobs
        SET status     = $1,
            resultado  = $2::jsonb,
            erro       = $3,
            duracao_ms = $4
      WHERE id = $5`,
    [
      body.sucesso ? "sucesso" : "erro",
      body.resultado ? JSON.stringify(body.resultado) : null,
      body.erro ? body.erro.slice(0, 2000) : null,
      body.duracao_ms ?? null,
      params.id,
    ]
  );

  return NextResponse.json({ ok: true });
}
