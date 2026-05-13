/**
 * POST /api/admin/vps/deploy/webhook
 *
 * Webhook do GitHub. Quando receber push na branch main, enfileira
 * um job 'deploy' pro vps-agent processar.
 *
 * Auth via HMAC SHA-256 com header X-Hub-Signature-256, secret
 * configurado em env GITHUB_WEBHOOK_SECRET.
 *
 * Public route (não exige login JWT — verificação é via signature).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { queryOne } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "GITHUB_WEBHOOK_SECRET não configurado" }, { status: 500 });
  }

  const sig = req.headers.get("x-hub-signature-256");
  if (!sig?.startsWith("sha256=")) {
    return NextResponse.json({ ok: false, error: "missing signature" }, { status: 401 });
  }

  const body = await req.text();
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: { ref?: string; head_commit?: { id?: string; message?: string } };
  try { payload = JSON.parse(body); } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Só faz deploy de push na main
  if (payload.ref !== "refs/heads/main") {
    return NextResponse.json({ ok: true, ignored: true, ref: payload.ref });
  }

  try {
    const job = await queryOne<{ id: string }>(
      `INSERT INTO vps_jobs (comando, params)
       VALUES ('deploy', $1::jsonb)
       RETURNING id`,
      [JSON.stringify({ commit: payload.head_commit?.id, mensagem: payload.head_commit?.message })]
    );
    return NextResponse.json({ ok: true, job_id: job?.id });
  } catch (err) {
    console.error("[VPS/Deploy/Webhook]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
