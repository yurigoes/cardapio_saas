/**
 * POST /api/admin/locais/[id]/conteudo — define o conteúdo base do local (template tela cheia).
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { definirConteudoBase } from "@/lib/conteudo";

const MAX = 200 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ ok: false, error: "arquivo ausente" }, { status: 400 });
    for (const f of files) {
      if (f.size > MAX) return NextResponse.json({ ok: false, error: `"${f.name}" excede 200MB` }, { status: 413 });
      if (!/^(image|video)\//.test(f.type)) return NextResponse.json({ ok: false, error: `"${f.name}": só imagem ou vídeo` }, { status: 415 });
    }

    const r = await definirConteudoBase(params.id, files.map(f => ({ arquivo: f, nomeArquivo: f.name })));
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true, enviados: r.enviados });
  } catch (err) {
    console.error("[locais/conteudo]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
