/**
 * Encarte do local — gestao de paginas (fila aditiva + replace + delete + reorder).
 *
 * GET    /api/admin/locais/[id]/encarte                 → lista paginas atuais
 * POST   /api/admin/locais/[id]/encarte                 → APPEND: adiciona paginas no fim da fila
 * PUT    /api/admin/locais/[id]/encarte                 → REPLACE: substitui todas as paginas
 * DELETE /api/admin/locais/[id]/encarte?paginaId=UUID   → remove uma pagina especifica
 * PATCH  /api/admin/locais/[id]/encarte  body: {ordem:[id1,id2,...]} → reordena
 *
 * Multipart form (POST/PUT):
 *  - file: 1+ arquivos (use o MESMO nome 'file' pra cada um). A ordem do upload
 *          define a ordem de insercao das paginas no bloco intercalado.
 *  - inicio?: 'YYYY-MM-DD' (somente PUT — APPEND nao mexe na vigencia)
 *  - fim?:    'YYYY-MM-DD' (idem)
 *  - duracao_seg?: numero (default 10s; aplica em todas as paginas adicionadas)
 *
 * Layout resultante:
 *   [pag1, pag2, ..., pagN, anuncio_1, pag1, pag2, ..., pagN, anuncio_2, ...]
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import {
  definirEncarteDoLocal, adicionarPaginasEncarte, removerPaginaEncarte,
  reordenarPaginasEncarte, listarPaginasEncarte,
} from "@/lib/veiculacao";

export const dynamic = "force-dynamic";

async function autorizar(req: NextRequest): Promise<boolean> {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && key === cronSecret) return true;
  return Boolean(await exigirMaster(req));
}

async function lerArquivos(req: NextRequest) {
  const form = await req.formData();
  const fileEntries = form.getAll("file").filter((v): v is File => v instanceof File);
  const inicio = (form.get("inicio") as string | null) || null;
  const fim    = (form.get("fim")    as string | null) || null;
  const dur    = form.get("duracao_seg");
  const duracaoSeg = dur ? Math.max(1, Math.min(600, parseInt(String(dur), 10) || 10)) : undefined;
  const arquivos = await Promise.all(
    fileEntries.map(async f => ({
      arquivo: Buffer.from(await f.arrayBuffer()),
      nomeArquivo: f.name,
      mime: f.type,
    }))
  );
  return { arquivos, inicio, fim, duracaoSeg };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autorizar(req))) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const paginas = await listarPaginasEncarte(params.id);
  return NextResponse.json({ ok: true, paginas });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autorizar(req))) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const { arquivos, duracaoSeg } = await lerArquivos(req);
  if (!arquivos.length) return NextResponse.json({ ok: false, error: "nenhum arquivo (form-data 'file')" }, { status: 400 });
  const r = await adicionarPaginasEncarte(params.id, { arquivos, duracaoSeg });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json(r);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autorizar(req))) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const { arquivos, inicio, fim, duracaoSeg } = await lerArquivos(req);
  if (!arquivos.length) return NextResponse.json({ ok: false, error: "nenhum arquivo (form-data 'file')" }, { status: 400 });
  const r = await definirEncarteDoLocal(params.id, { arquivos, inicio, fim, duracaoSeg });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, paginas: r.paginas, regenerado: r.regenerado });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autorizar(req))) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const paginaId = req.nextUrl.searchParams.get("paginaId");
  if (!paginaId) return NextResponse.json({ ok: false, error: "?paginaId obrigatorio" }, { status: 400 });
  const r = await removerPaginaEncarte(params.id, paginaId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json(r);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autorizar(req))) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => null) as { ordem?: string[] } | null;
  if (!body?.ordem?.length) return NextResponse.json({ ok: false, error: "body { ordem: string[] } obrigatorio" }, { status: 400 });
  const r = await reordenarPaginasEncarte(params.id, body.ordem);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json(r);
}
