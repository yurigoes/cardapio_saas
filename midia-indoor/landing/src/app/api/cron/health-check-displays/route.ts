/**
 * GET/POST /api/cron/health-check-displays?key=CRON_SECRET
 *
 * Detecta displays offline ha +24h e abre OS automatica pra o item de
 * inventario vinculado a esse display (via xibo_display_id).
 *
 * Evita duplicar: se ja existe OS aberta com motivo='problema' aberta nas
 * ultimas 48h pra esse item, NAO abre nova.
 *
 * Rodar diariamente junto com health-check-layouts.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull } from "@/lib/xibo";
import { abrirOS } from "@/lib/inventario-os";

export const dynamic = "force-dynamic";

const LIMITE_HORAS_OFFLINE = 24;

async function handle(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false, error: "nao autorizado" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const displays = await listarDisplaysFull();
    const agora = Date.now();
    const offline: Array<{ displayId: number; nome: string; minutosOff: number }> = [];
    for (const d of displays) {
      if (d.loggedIn === 1) continue;
      const last = d.lastAccessed ? Number(d.lastAccessed) * 1000 : 0;
      if (!last) continue;
      const minutos = Math.round((agora - last) / 60000);
      if (minutos >= LIMITE_HORAS_OFFLINE * 60) {
        offline.push({ displayId: d.displayId, nome: d.display, minutosOff: minutos });
      }
    }

    const resultados: Array<{ displayId: number; nome: string; status: "os_aberta" | "ja_tinha_os" | "sem_inventario"; osId?: string }> = [];
    for (const o of offline) {
      // Acha item de inventario vinculado a esse display
      const item = await db().query<{ id: string; nome: string }>(
        `SELECT id, nome FROM midia_inventario WHERE xibo_display_id = $1 LIMIT 1`, [o.displayId]
      ).then(r => r.rows[0]);
      if (!item) {
        resultados.push({ displayId: o.displayId, nome: o.nome, status: "sem_inventario" });
        continue;
      }
      // Ja tem OS aberta nas ultimas 48h pra esse item?
      const jaTem = await db().query<{ id: string }>(
        `SELECT id FROM midia_inventario_os
          WHERE inventario_id = $1 AND status IN ('aberto','em_analise')
            AND criada_em >= NOW() - INTERVAL '48 hours' LIMIT 1`, [item.id]
      ).then(r => r.rows[0]);
      if (jaTem) {
        resultados.push({ displayId: o.displayId, nome: o.nome, status: "ja_tinha_os" });
        continue;
      }
      // Abre OS automatica
      const horas = Math.round(o.minutosOff / 60);
      const r = await abrirOS({
        inventarioId: item.id,
        motivo: "problema",
        descricao: `[AUTO] Display Xibo #${o.displayId} (${o.nome}) está offline há ${horas}h. Verifique energia/rede/box.`,
        autor: { tipo: "sistema", nome: "Health-check automático" },
      });
      if (r.ok && r.osId) {
        resultados.push({ displayId: o.displayId, nome: o.nome, status: "os_aberta", osId: r.osId });
      }
    }

    console.log(`[health-check-displays] ${offline.length} displays offline · ${resultados.filter(r => r.status === "os_aberta").length} OS abertas auto`);
    return NextResponse.json({
      ok: true,
      total_offline: offline.length,
      os_abertas: resultados.filter(r => r.status === "os_aberta").length,
      ja_tinham_os: resultados.filter(r => r.status === "ja_tinha_os").length,
      sem_inventario: resultados.filter(r => r.status === "sem_inventario").length,
      detalhes: resultados,
    });
  } catch (err) {
    console.error("[health-check-displays]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
