/**
 * POST /api/admin/campanhas/[id]/lancar    — cria/atualiza a Ad Campaign no Xibo
 * POST .../encerrar é rota separada.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { lancarCampanha } from "@/lib/campanhas";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const r = await lancarCampanha(params.id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, xibo_campaign_id: r.xiboCampaignId });
}
