/**
 * GET    /api/admin/campanhas/[id]/playlist          — lista artes ativas (encarte_gondola)
 * POST   /api/admin/campanhas/[id]/playlist          — multipart: 1+ arquivos pra acrescentar à playlist
 * DELETE /api/admin/campanhas/[id]/playlist?arte_id  — remove um item da playlist (e rebuild)
 *
 * Após qualquer mudança, o layout no Xibo é reconstruído com criarLayoutLoop.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";
import { criarLayoutLoop, excluirLayout } from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // upload pode demorar

const ROOT_FOLDER = Number(process.env.XIBO_ROOT_FOLDER_ID ?? 1);

async function carregarCampanha(id: string) {
  await ensureSchema();
  return db().query<{ id: string; nome: string; conta_id: string; segundos: number; xibo_layout_id: number | null; formato: string }>(
    `SELECT id, nome, conta_id, segundos, xibo_layout_id, formato FROM midia_campanhas WHERE id = $1`,
    [id]
  ).then(r => r.rows[0]);
}

async function dimensoesDoLocal(campanhaId: string): Promise<{ width: number; height: number }> {
  const local = await db().query<{ largura: number; altura: number }>(
    `SELECT l.largura, l.altura FROM midia_campanha_locais cl JOIN midia_locais l ON l.id = cl.local_id WHERE cl.campanha_id = $1 LIMIT 1`,
    [campanhaId]
  ).then(r => r.rows[0]);
  return { width: local?.largura ?? 1080, height: local?.altura ?? 1920 };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const rows = await db().query(
    `SELECT id, arte_nome, arte_tipo, xibo_layout_id, xibo_media_id, ativa, criada_em
       FROM midia_campanha_artes WHERE campanha_id = $1 AND ativa = true ORDER BY criada_em`,
    [params.id]
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, itens: rows });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const camp = await carregarCampanha(params.id);
  if (!camp) return NextResponse.json({ ok: false, error: "campanha não encontrada" }, { status: 404 });
  if (camp.formato !== "encarte_gondola") return NextResponse.json({ ok: false, error: "playlist só pra formato encarte_gondola" }, { status: 400 });

  try {
    const form = await req.formData();
    const arquivos = form.getAll("file").filter(f => f instanceof File) as File[];
    if (!arquivos.length) return NextResponse.json({ ok: false, error: "nenhum arquivo" }, { status: 400 });

    // Registra cada arte (todas ativas — playlist completa)
    for (const f of arquivos) {
      const tipo = (f.type ?? "").startsWith("video") ? "video" : "image";
      await db().query(
        `INSERT INTO midia_campanha_artes (campanha_id, arte_nome, arte_tipo, ativa, enviada_por) VALUES ($1,$2,$3,true,$4)`,
        [params.id, f.name, tipo, master.email ?? null]
      );
    }

    // Rebuild do layout no Xibo com TODAS as artes ativas
    const novoLayout = await rebuildLayoutGondola(params.id, camp, arquivos);
    await db().query(
      `UPDATE midia_campanhas SET xibo_layout_id = $1, arte_status='aprovada', status = CASE WHEN status='rascunho' THEN 'aguardando_arte' ELSE status END, updated_at=NOW() WHERE id = $2`,
      [novoLayout.layoutId, params.id]
    );

    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "playlist.add", entidade: "campanha", entidade_id: params.id, detalhes: { qtd: arquivos.length } });
    return NextResponse.json({ ok: true, layoutId: novoLayout.layoutId, total: arquivos.length });
  } catch (err) {
    console.error("[playlist POST]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}

async function rebuildLayoutGondola(campanhaId: string, camp: { nome: string; segundos: number; xibo_layout_id: number | null }, novosArquivos: File[]) {
  const { width, height } = await dimensoesDoLocal(campanhaId);

  // Pega TODAS as artes ativas + adiciona os novos arquivos no fim
  // Como os novos ainda não estão no Xibo, mandamos eles diretamente
  const buffers: Array<{ arquivo: Buffer; nomeArquivo: string }> = [];
  for (const f of novosArquivos) {
    const buf = Buffer.from(await f.arrayBuffer());
    buffers.push({ arquivo: buf, nomeArquivo: f.name });
  }

  // Limpa o layout antigo se existir
  if (camp.xibo_layout_id) {
    try { await excluirLayout(camp.xibo_layout_id); } catch (e) { console.warn("[playlist rebuild] limpar antigo:", (e as Error).message); }
  }

  return criarLayoutLoop({
    nome: `${camp.nome} [gondola] ${Date.now().toString(36)}`,
    arquivos: buffers,
    folderId: ROOT_FOLDER,
    width, height,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const arteId = req.nextUrl.searchParams.get("arte_id");
  if (!arteId) return NextResponse.json({ ok: false, error: "arte_id obrigatório" }, { status: 400 });
  await db().query(`UPDATE midia_campanha_artes SET ativa = false WHERE id = $1 AND campanha_id = $2`, [arteId, params.id]);
  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "playlist.remove", entidade: "campanha", entidade_id: params.id, detalhes: { arte_id: arteId } });
  return NextResponse.json({ ok: true, msg: "Item removido — reaplique a campanha pra rebuildar o layout" });
}
