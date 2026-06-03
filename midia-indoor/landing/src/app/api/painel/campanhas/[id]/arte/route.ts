/**
 * POST /api/painel/campanhas/[id]/arte — anunciante envia a arte da própria campanha.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { anexarArte } from "@/lib/campanhas";
import { baixarMidia } from "@/lib/xibo";

const MAX = 200 * 1024 * 1024;

async function donoDaCampanha(campanhaId: string, contaId: string): Promise<boolean> {
  await ensureSchema();
  const r = await db().query(`SELECT 1 FROM midia_campanhas WHERE id = $1 AND conta_id = $2`, [campanhaId, contaId]);
  return r.rows.length > 0;
}

/** GET — preview da arte (proxy autenticado do Xibo). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const camp = await db().query<{ xibo_media_id: number | null; arte_tipo: string | null }>(
    `SELECT xibo_media_id, arte_tipo FROM midia_campanhas WHERE id = $1 AND conta_id = $2`,
    [params.id, auth.sub]
  ).then(r => r.rows[0]);
  if (!camp?.xibo_media_id) return NextResponse.json({ ok: false, error: "sem arte" }, { status: 404 });
  try {
    const tipo = camp.arte_tipo === "video" ? "video" : "image";
    const { buffer, contentType } = await baixarMidia(camp.xibo_media_id, tipo);
    return new NextResponse(buffer, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    console.error("[painel/arte GET]", err);
    return NextResponse.json({ ok: false, error: "erro ao carregar arte" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  if (!await donoDaCampanha(params.id, auth.sub)) return NextResponse.json({ ok: false, error: "campanha não encontrada" }, { status: 404 });

  try {
    const form = await req.formData();
    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, error: "arquivo ausente" }, { status: 400 });
    if (arquivo.size > MAX) return NextResponse.json({ ok: false, error: "arquivo muito grande (máx 200MB)" }, { status: 413 });
    if (!/^(image|video)\//.test(arquivo.type)) return NextResponse.json({ ok: false, error: "só imagem ou vídeo" }, { status: 415 });

    await anexarArte(params.id, arquivo, arquivo.name, arquivo.type, { precisaAprovacao: true, enviadaPor: auth.email });
    return NextResponse.json({ ok: true, msg: "Arte enviada — aguardando aprovação" });
  } catch (err) {
    console.error("[painel/campanhas arte]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
