/**
 * POST /api/admin/displays/[id]/screenshot — pede pro player capturar a tela
 * GET  /api/admin/displays/[id]/screenshot — devolve a última captura (proxy)
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { pedirScreenshot, baixarScreenshot } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  try { await pedirScreenshot(id); return NextResponse.json({ ok: true, msg: "Captura solicitada — disponível em ~10–30s" }); }
  catch (err) { return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 }); }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  try {
    const r = await baixarScreenshot(id);
    if (!r) return NextResponse.json({ ok: false, error: "sem captura ainda — peça uma nova" }, { status: 404 });
    return new NextResponse(r.buffer, { headers: { "Content-Type": r.contentType, "Cache-Control": "no-store" } });
  } catch (err) { return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 }); }
}
