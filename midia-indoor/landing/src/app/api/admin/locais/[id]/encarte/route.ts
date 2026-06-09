/**
 * PUT /api/admin/locais/[id]/encarte
 *
 * Multipart form:
 *  - file: 1+ arquivos (use o MESMO nome 'file' pra cada um). A ordem do upload
 *          define a ordem das paginas no bloco intercalado.
 *  - inicio?: 'YYYY-MM-DD' (default = hoje)
 *  - fim?:    'YYYY-MM-DD' (default = sem fim)
 *  - duracao_seg?: numero (default 10s p/ imagens — aplica em TODAS as paginas)
 *
 * Substitui TODAS as paginas anteriores do encarte (replace-mode). Marca
 * plano_veiculacao='encarte_totem' e regenera o layout intercalado imediatamente.
 *
 * Layout resultante:
 *   [pag1, pag2, ..., pagN, anuncio_1, pag1, pag2, ..., pagN, anuncio_2, ...]
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { definirEncarteDoLocal } from "@/lib/veiculacao";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }

  const form = await req.formData();
  const fileEntries = form.getAll("file").filter((v): v is File => v instanceof File);
  if (!fileEntries.length) return NextResponse.json({ ok: false, error: "nenhum arquivo enviado (use form-data com 'file')" }, { status: 400 });

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

  const r = await definirEncarteDoLocal(params.id, { arquivos, inicio, fim, duracaoSeg });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, paginas: r.paginas, regenerado: r.regenerado });
}
