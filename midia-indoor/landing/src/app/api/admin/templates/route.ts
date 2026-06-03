/**
 * POST /api/admin/templates  body { template, nome, width, height, opts? }
 * template: "video_ticker" | "imagem_clima_relogio" | "rss_clima"
 * Cria o layout multi-zona no Xibo e devolve o layoutId. Agendamento ainda é manual.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigirMaster } from "@/lib/admin-auth";
import { criarLayoutMultiZona, type RegionSpec } from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

const schema = z.object({
  template: z.enum(["video_ticker", "imagem_clima_relogio", "rss_clima"]),
  nome:    z.string().min(1).max(120),
  width:   z.coerce.number().int().min(120).max(8000).default(1080),
  height:  z.coerce.number().int().min(120).max(8000).default(1920),
  rss_url: z.string().url().optional(),
  latitude:  z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

const ROOT_FOLDER = Number(process.env.XIBO_ROOT_FOLDER_ID ?? 1);

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  let regions: RegionSpec[] = [];
  if (b.template === "video_ticker") {
    if (!b.rss_url) return NextResponse.json({ ok: false, error: "rss_url obrigatório" }, { status: 400 });
    regions = [
      { left: 0, top: 0, width: 100, height: 88, widgets: [] },                                              // vídeo (sobe depois)
      { left: 0, top: 88, width: 100, height: 12, widgets: [{ tipo: "rss", uri: b.rss_url, duracaoSeg: 60 }] }, // ticker
    ];
  } else if (b.template === "imagem_clima_relogio") {
    regions = [
      { left: 0, top: 0, width: 100, height: 80, widgets: [] },                                              // imagem (sobe depois)
      { left: 0, top: 80, width: 60, height: 20, widgets: [{ tipo: "clima", latitude: b.latitude ?? -23.55, longitude: b.longitude ?? -46.63, duracaoSeg: 30 }] },
      { left: 60, top: 80, width: 40, height: 20, widgets: [{ tipo: "relogio", formato: "HH:mm", duracaoSeg: 30 }] },
    ];
  } else if (b.template === "rss_clima") {
    if (!b.rss_url) return NextResponse.json({ ok: false, error: "rss_url obrigatório" }, { status: 400 });
    regions = [
      { left: 0, top: 0, width: 100, height: 70, widgets: [{ tipo: "rss", uri: b.rss_url, duracaoSeg: 90, titulo: "Notícias" }] },
      { left: 0, top: 70, width: 100, height: 30, widgets: [{ tipo: "clima", latitude: b.latitude ?? -23.55, longitude: b.longitude ?? -46.63, duracaoSeg: 60 }] },
    ];
  }

  try {
    const r = await criarLayoutMultiZona({ nome: b.nome, folderId: ROOT_FOLDER, width: b.width, height: b.height, regions });
    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "template.criado", entidade: "layout", entidade_id: String(r.layoutId), detalhes: { template: b.template, nome: b.nome } });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
