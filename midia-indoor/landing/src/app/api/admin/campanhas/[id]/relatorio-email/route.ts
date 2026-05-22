/**
 * POST /api/admin/campanhas/[id]/relatorio-email — envia o relatório por e-mail ao anunciante.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { enviarRelatorioPorEmail } from "@/lib/campanhas";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const r = await enviarRelatorioPorEmail(params.id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
