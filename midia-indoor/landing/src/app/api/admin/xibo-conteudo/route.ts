/**
 * GET  /api/admin/xibo-conteudo — lista campanhas (ad) que estão no Xibo, marcando
 *      quais pertencem a uma campanha do sistema e quais são órfãs.
 * POST /api/admin/xibo-conteudo — { campaignId } exclui a campanha + seus layouts no Xibo.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { listarCampanhas, excluirCampanha, excluirLayout } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const todas = await listarCampanhas();
    const ads = todas.filter(c => c.type === "ad");

    // Campanhas do sistema (por xibo_campaign_id) → anunciante/nome/status
    const sis = await db().query<{ xibo_campaign_id: number; nome: string; status: string; empresa: string }>(
      `SELECT c.xibo_campaign_id, c.nome, c.status, ct.empresa
         FROM midia_campanhas c JOIN midia_contas ct ON ct.id = c.conta_id
        WHERE c.xibo_campaign_id IS NOT NULL`
    ).then(r => r.rows);
    const mapa = new Map(sis.map(s => [s.xibo_campaign_id, s]));

    const lista = ads.map(c => {
      const s = mapa.get(c.campaignId);
      return {
        campaignId: c.campaignId,
        nome: c.campaign,
        layouts: (c.layouts ?? []).map(l => l.layoutId),
        sistema: s ? { empresa: s.empresa, campanha: s.nome, status: s.status } : null,
        orfa: !s,
      };
    });
    return NextResponse.json({ ok: true, campanhas: lista });
  } catch (err) {
    console.error("[admin/xibo-conteudo GET]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const b = await req.json().catch(() => null) as { campaignId?: number; layouts?: number[] } | null;
  if (!b?.campaignId) return NextResponse.json({ ok: false, error: "campaignId obrigatório" }, { status: 400 });
  try {
    try { await excluirCampanha(b.campaignId); } catch (e) { console.warn("[xibo-conteudo] campanha:", (e as Error).message); }
    for (const lid of b.layouts ?? []) { try { await excluirLayout(lid); } catch (e) { console.warn("[xibo-conteudo] layout:", (e as Error).message); } }
    // se essa campanha pertencia a uma campanha do sistema, marca encerrada
    await ensureSchema();
    await db().query(`UPDATE midia_campanhas SET status='encerrada', xibo_campaign_id=NULL WHERE xibo_campaign_id=$1`, [b.campaignId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/xibo-conteudo POST]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
