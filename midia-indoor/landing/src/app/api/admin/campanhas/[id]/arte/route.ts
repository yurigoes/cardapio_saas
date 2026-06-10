/**
 * POST /api/admin/campanhas/[id]/arte — envia a arte (multipart) → cria layout no Xibo.
 * Se a campanha estiver no_ar, RE-LANCA automaticamente pra que a TV pegue a
 * nova arte imediatamente (sem precisar clicar 'Reaplicar').
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { anexarArte, lancarCampanha } from "@/lib/campanhas";
import { db, ensureSchema } from "@/lib/db";

const MAX = 200 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  try {
    const form = await req.formData();
    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, error: "arquivo ausente" }, { status: 400 });
    if (arquivo.size > MAX) return NextResponse.json({ ok: false, error: "arquivo muito grande (máx 200MB)" }, { status: 413 });
    if (!/^(image|video)\//.test(arquivo.type)) return NextResponse.json({ ok: false, error: "só imagem ou vídeo" }, { status: 415 });

    await anexarArte(params.id, arquivo, arquivo.name, arquivo.type);

    // Se campanha ja estava no ar, re-lanca pra propagar layout novo imediatamente
    await ensureSchema();
    const status = await db().query<{ status: string }>(
      `SELECT status FROM midia_campanhas WHERE id = $1`, [params.id]
    ).then(r => r.rows[0]?.status);

    let relancada = false;
    if (status === "no_ar") {
      const r = await lancarCampanha(params.id);
      relancada = r.ok;
      if (!r.ok) console.warn(`[arte] re-lancamento auto falhou: ${r.erro}`);
    }

    return NextResponse.json({ ok: true, relancada });
  } catch (err) {
    console.error("[admin/campanhas arte]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
