/**
 * POST /api/admin/campanhas/[id]/arte — envia a arte (multipart) → cria layout no Xibo.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { anexarArte } from "@/lib/campanhas";

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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/campanhas arte]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
