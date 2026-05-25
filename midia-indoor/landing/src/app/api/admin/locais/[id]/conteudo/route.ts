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
    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, error: "arquivo ausente" }, { status: 400 });
    if (arquivo.size > MAX) return NextResponse.json({ ok: false, error: "arquivo muito grande (máx 200MB)" }, { status: 413 });
    if (!/^(image|video)\//.test(arquivo.type)) return NextResponse.json({ ok: false, error: "só imagem ou vídeo" }, { status: 415 });

    const r = await definirConteudoBase(params.id, arquivo, arquivo.name, arquivo.type);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[locais/conteudo]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
