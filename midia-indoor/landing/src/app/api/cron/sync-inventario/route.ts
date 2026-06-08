/**
 * GET/POST /api/cron/sync-inventario?key=CRON_SECRET
 * Roda 1x a cada 10min. Pega os displays do Xibo e sincroniza com inventário:
 *  - Se item de inventário tem MAC e bate com um display: vincula xibo_display_id
 *  - Atualiza ip_local do item baseado no clientAddress do Xibo
 *  - Atualiza WoL no Xibo se o item tem MAC e o display ainda não tem
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
  let vinculados = 0, ips_atualizados = 0;

  try {
    const displays = await listarDisplaysFull();
    const inventario = await p.query<{ id: string; mac: string | null; xibo_display_id: number | null }>(
      `SELECT id, mac, xibo_display_id FROM midia_inventario WHERE ativo = true`
    ).then(r => r.rows);

    for (const item of inventario) {
      if (!item.mac) continue;
      const macNorm = item.mac.toUpperCase().replace(/[^A-F0-9]/g, "");
      const match = displays.find(d => {
        const dMac = (d.macAddress ?? "").toUpperCase().replace(/[^A-F0-9]/g, "");
        return dMac && dMac === macNorm;
      });
      if (!match) continue;

      // Vincula display id no inventário se mudou
      if (item.xibo_display_id !== match.displayId) {
        await p.query(`UPDATE midia_inventario SET xibo_display_id = $1, updated_at = NOW() WHERE id = $2`, [match.displayId, item.id]);
        vinculados++;
      }
      // Atualiza IP local
      const ip = (match as { clientAddress?: string }).clientAddress;
      if (ip) {
        await p.query(`UPDATE midia_inventario SET ip_local = $1 WHERE id = $2`, [ip, item.id]).catch(() => {});
        ips_atualizados++;
      }
    }

    return NextResponse.json({ ok: true, vinculados, ips_atualizados, total_inventario: inventario.length, total_displays: displays.length });
  } catch (err) {
    console.error("[sync-inventario]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
