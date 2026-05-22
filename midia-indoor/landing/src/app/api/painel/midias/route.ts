/**
 * GET  /api/painel/midias  — lista a mídia da pasta do cliente no Xibo
 * POST /api/painel/midias  — faz upload de um arquivo (multipart) pra pasta do cliente
 *
 * O isolamento é por folder do Xibo (xibo_folder_id da conta).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { uploadMedia, listarMidias } from "@/lib/xibo";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const TIPOS_OK = ["image/", "video/"];

async function folderDaConta(contaId: string): Promise<number | null> {
  await ensureSchema();
  const p = db();
  const r = await p.query<{ xibo_folder_id: number | null; status: string }>(
    `SELECT xibo_folder_id, status FROM midia_contas WHERE id = $1`,
    [contaId]
  );
  const row = r.rows[0];
  if (!row || row.status !== "ativo") return null;
  return row.xibo_folder_id;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  const folderId = await folderDaConta(auth.sub);
  if (!folderId) return NextResponse.json({ ok: false, error: "conta ainda não ativada" }, { status: 403 });

  try {
    const midias = await listarMidias(folderId);
    return NextResponse.json({ ok: true, midias });
  } catch (err) {
    console.error("[painel/midias GET]", err);
    return NextResponse.json({ ok: false, error: "erro ao listar mídias" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  const folderId = await folderDaConta(auth.sub);
  if (!folderId) return NextResponse.json({ ok: false, error: "conta ainda não ativada" }, { status: 403 });

  try {
    const form = await req.formData();
    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ ok: false, error: "arquivo ausente" }, { status: 400 });
    }
    if (arquivo.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "arquivo muito grande (máx 200MB)" }, { status: 413 });
    }
    if (!TIPOS_OK.some(t => arquivo.type.startsWith(t))) {
      return NextResponse.json({ ok: false, error: "só imagens ou vídeos" }, { status: 415 });
    }

    const r = await uploadMedia(arquivo, arquivo.name, folderId);
    return NextResponse.json({ ok: true, media: r });
  } catch (err) {
    console.error("[painel/midias POST]", err);
    return NextResponse.json({ ok: false, error: "erro no upload" }, { status: 500 });
  }
}
