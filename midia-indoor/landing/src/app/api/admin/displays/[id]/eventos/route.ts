/**
 * GET /api/admin/displays/[id]/eventos?dia=YYYY-MM-DD
 * Lista os eventos agendados (schedule + ad campaigns) que o player vai tocar
 * no dia informado (default = hoje). Substitui a aba "Schedule" do Xibo.
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin } from "@/lib/admin-auth";
import { eventosDoDisplay } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const dia = req.nextUrl.searchParams.get("dia") || new Date().toISOString().slice(0, 10);
  const displayId = Number(params.id);
  if (!displayId) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  try {
    const eventos = await eventosDoDisplay(displayId, dia);
    return NextResponse.json({ ok: true, dia, eventos });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
