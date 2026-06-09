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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }

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
