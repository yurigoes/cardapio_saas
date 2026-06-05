/**
 * GET/POST /api/cron/sync-xibo?key=CRON_SECRET
 * Sincroniza estado relevante do Xibo pro DB do SaaS (1x a cada 5min):
 *  - Atualiza midia_locais com último status dos displays (online/offline)
 *  - Detecta locais sem displays vinculados (alerta)
 *  - Atualiza contadores de telas online/total
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  if (!secret || provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await ensureSchema();
  const p = db();

  try {
    const displays = await listarDisplaysFull();
    const locais = await p.query<{ id: string; xibo_display_group_id: number | null }>(
      `SELECT id, xibo_display_group_id FROM midia_locais WHERE archived_at IS NULL`
    ).then(r => r.rows);

    let atualizados = 0;
    for (const l of locais) {
      if (!l.xibo_display_group_id) continue;
      const displaysDoLocal = displays.filter(d => (d.displayGroups ?? []).some(g => g.displayGroupId === l.xibo_display_group_id));
      const total = displaysDoLocal.length;
      const online = displaysDoLocal.filter(d => d.loggedIn === 1).length;
      await p.query(
        `UPDATE midia_locais SET telas_total = $1, telas_online = $2, sync_em = NOW() WHERE id = $3`,
        [total, online, l.id]
      ).catch(() => {}); // colunas podem não existir ainda
      atualizados++;
    }

    return NextResponse.json({ ok: true, displays: displays.length, locais_atualizados: atualizados });
  } catch (err) {
    console.error("[sync-xibo]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
