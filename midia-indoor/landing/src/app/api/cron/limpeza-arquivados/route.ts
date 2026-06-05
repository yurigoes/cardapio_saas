/**
 * GET/POST /api/cron/limpeza-arquivados?key=CRON_SECRET
 * Roda 1x/dia. Apaga definitivamente:
 *   - campanhas com archived_at > 6 meses
 *   - locais com archived_at > 6 meses
 *   - anunciantes com archived_at > 6 meses (cascade pega campanhas/usuarios)
 * Tenta limpar refs no Xibo (ad campaigns, layouts, display groups).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { excluirCampanha as excluirCampanhaXibo } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  if (!secret || provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await ensureSchema();
  const p = db();
  const limites = { meses: 6 };

  // 1) Campanhas arquivadas há mais de 6 meses
  const campanhasMortas = await p.query<{ id: string; xibo_campaign_id: number | null }>(
    `SELECT id, xibo_campaign_id FROM midia_campanhas
      WHERE archived_at IS NOT NULL AND archived_at < NOW() - INTERVAL '${limites.meses} months'`
  ).then(r => r.rows);
  let campanhasApagadas = 0;
  for (const c of campanhasMortas) {
    if (c.xibo_campaign_id) { try { await excluirCampanhaXibo(c.xibo_campaign_id); } catch { /* xibo já pode ter limpado */ } }
    try { await p.query(`DELETE FROM midia_campanhas WHERE id = $1`, [c.id]); campanhasApagadas++; }
    catch (e) { console.warn("[limpeza] campanha", c.id, ":", (e as Error).message); }
  }

  // 2) Locais arquivados há mais de 6 meses
  const locaisMortos = await p.query<{ id: string }>(
    `SELECT id FROM midia_locais
      WHERE archived_at IS NOT NULL AND archived_at < NOW() - INTERVAL '${limites.meses} months'`
  ).then(r => r.rows);
  let locaisApagados = 0;
  for (const l of locaisMortos) {
    try { await p.query(`DELETE FROM midia_locais WHERE id = $1`, [l.id]); locaisApagados++; }
    catch (e) { console.warn("[limpeza] local", l.id, ":", (e as Error).message); }
  }

  // 3) Anunciantes arquivados há mais de 6 meses
  const anunciantesMortos = await p.query<{ id: string }>(
    `SELECT id FROM midia_contas
      WHERE archived_at IS NOT NULL AND archived_at < NOW() - INTERVAL '${limites.meses} months'`
  ).then(r => r.rows);
  let anunciantesApagados = 0;
  for (const a of anunciantesMortos) {
    try { await p.query(`DELETE FROM midia_contas WHERE id = $1`, [a.id]); anunciantesApagados++; }
    catch (e) { console.warn("[limpeza] anunciante", a.id, ":", (e as Error).message); }
  }

  // 4) Histórico de criativos órfãos (campanhas que já não existem)
  await p.query(`DELETE FROM midia_campanha_artes WHERE campanha_id NOT IN (SELECT id FROM midia_campanhas);`);

  return NextResponse.json({
    ok: true,
    apagados: {
      campanhas: campanhasApagadas,
      locais: locaisApagados,
      anunciantes: anunciantesApagados,
    },
  });
}
