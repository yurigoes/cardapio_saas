/**
 * POST /api/agent/jobs/[id]/ack
 * Body: { sucesso: boolean, erro?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { queryOne } from "@/lib/db/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "auth missing" }, { status: 401 });
  }
  const key  = auth.slice(7).trim();
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const agent = await queryOne<{ empresa_id: string }>(
    `SELECT empresa_id FROM print_agents WHERE agent_key_hash = $1 AND ativo = true`,
    [hash]
  );
  if (!agent) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { sucesso?: boolean; erro?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 }); }

  const status = body.sucesso ? "sucesso" : "erro";
  const erro   = body.erro?.slice(0, 500) ?? null;

  await queryOne(
    `UPDATE print_jobs
        SET status = $1, erro = $2, enviado_em = NOW()
      WHERE id = $3 AND empresa_id = $4`,
    [status, erro, params.id, agent.empresa_id]
  );

  return NextResponse.json({ ok: true });
}
