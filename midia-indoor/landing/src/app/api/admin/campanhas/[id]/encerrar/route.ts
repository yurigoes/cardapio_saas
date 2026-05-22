/**
 * POST /api/admin/campanhas/[id]/encerrar — remove a Ad Campaign do Xibo.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { encerrarCampanha } from "@/lib/campanhas";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const r = await encerrarCampanha(params.id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
