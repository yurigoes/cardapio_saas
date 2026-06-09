/**
 * PUT /api/admin/telas/[id]/gondola
 *
 * Multipart form:
 *  - file: arquivo (image/video) da midia ponta dessa gondola
 *  - duracao_seg?: numero (default 10s p/ imagens)
 *
 * Marca o LOCAL como plano_veiculacao='ponta_gondola' (se ainda nao for)
 * e regenera o Default Layout da tela (encarte_da_tela > ad1 > encarte > ad2 ...).
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { definirPontaGondola } from "@/lib/veiculacao";

export const dynamic = "force-dynamic";

async function guardAuth(req: NextRequest): Promise<NextResponse | null> {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const block = await guardAuth(req); if (block) return block;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file ausente" }, { status: 400 });

  const dur = form.get("duracao_seg");
  const duracaoSeg = dur ? Math.max(1, Math.min(600, parseInt(String(dur), 10) || 10)) : undefined;

  const buf = Buffer.from(await file.arrayBuffer());
  const r = await definirPontaGondola(params.id, {
    arquivo: buf, nomeArquivo: file.name, mime: file.type, duracaoSeg,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, mediaId: r.mediaId });
}

/**
 * PATCH /api/admin/telas/[id]/gondola
 * Body JSON: { local_id?: uuid|null, gondola_duracao_seg?: number }
 *
 * Permite vincular a tela a um local (necessario pra ponta_gondola saber
 * qual local regenerar) e ajustar a duracao.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const block = await guardAuth(req); if (block) return block;
  const body = await req.json().catch(() => null) as { local_id?: string | null; gondola_duracao_seg?: number } | null;
  if (!body) return NextResponse.json({ ok: false, error: "body invalido" }, { status: 400 });

  const { db, ensureSchema } = await import("@/lib/db");
  await ensureSchema();
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.local_id !== undefined) { vals.push(body.local_id); sets.push(`local_id = $${vals.length}`); }
  if (typeof body.gondola_duracao_seg === "number") { vals.push(Math.max(1, Math.min(600, body.gondola_duracao_seg))); sets.push(`gondola_duracao_seg = $${vals.length}`); }
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(params.id);
  await db().query(`UPDATE midia_telas SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
