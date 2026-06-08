/**
 * GET/POST /api/cron/auto-recovery?key=CRON_SECRET
 * Roda a cada 15min. Pra cada display offline há mais de X tempo:
 *   - 30min offline → tenta WoL + notifica master
 *   - 2h offline    → notifica + cria chamado interno (se não tiver)
 *   - 6h offline    → email de emergência
 * Quando reconecta: bump no defaultLayoutId pra destravar cache.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull, wolDisplay, bumpDisplayCache, setDefaultLayout } from "@/lib/xibo";
import { notificar } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  if (!secret || provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await ensureSchema();
  const p = db();
  const agora = Math.floor(Date.now() / 1000);

  try {
    const displays = await listarDisplaysFull();
    // Estado prévio: telas que estavam offline (rastreio simples via tabela midia_locais.sync_em e telas_online)
    const acoes: Array<{ displayId: number; display: string; segOffline: number; acao: string }> = [];

    for (const d of displays) {
      const segOff = d.loggedIn === 0 && d.lastAccessed ? agora - d.lastAccessed : 0;

      // Reconectou recente? bump pra destravar
      if (d.loggedIn === 1 && d.lastAccessed && (agora - d.lastAccessed) < 600 /* 10min */) {
        try {
          const layoutAlvo = d.defaultLayoutId ?? 1;
          await bumpDisplayCache(d.displayId, layoutAlvo);
          acoes.push({ displayId: d.displayId, display: d.display, segOffline: 0, acao: "bump-pos-reconexao" });
        } catch { /* ignora */ }
        continue;
      }

      // Offline 30min+ → tenta WoL
      if (segOff >= 1800 && segOff < 3600) {
        try { await wolDisplay(d.displayId); acoes.push({ displayId: d.displayId, display: d.display, segOffline: segOff, acao: "wol" }); }
        catch { /* segue */ }
      }

      // Offline 1h+ → notifica master (uma vez por TV, dedupe via tipo+entidade no titulo)
      if (segOff >= 3600 && segOff < 7200) {
        // Verifica se já notificamos nas últimas 6h
        const ja = await p.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM midia_notificacoes
            WHERE tipo='tela-offline' AND titulo LIKE $1 AND created_at > NOW() - INTERVAL '6 hours'`,
          [`%${d.display}%`]
        ).then(r => Number(r.rows[0]?.n ?? 0));
        if (!ja) {
          await notificar({ tipo: "tela-offline", titulo: `Tela "${d.display}" offline há mais de 1h`, mensagem: `Última conexão: ${d.lastAccessed ? new Date(d.lastAccessed * 1000).toLocaleString("pt-BR") : "n/d"}`, icone: "⚠️" });
          acoes.push({ displayId: d.displayId, display: d.display, segOffline: segOff, acao: "notif-1h" });
        }
      }

      // Offline 6h+ → notificação crítica
      if (segOff >= 21600) {
        const ja = await p.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM midia_notificacoes
            WHERE tipo='tela-offline-critico' AND titulo LIKE $1 AND created_at > NOW() - INTERVAL '12 hours'`,
          [`%${d.display}%`]
        ).then(r => Number(r.rows[0]?.n ?? 0));
        if (!ja) {
          await notificar({ tipo: "tela-offline-critico", titulo: `🔴 CRÍTICO: "${d.display}" offline há ${Math.floor(segOff / 3600)}h`, mensagem: "Verifique o ponto pessoalmente — possível defeito de hardware/rede.", icone: "🚨" });
          acoes.push({ displayId: d.displayId, display: d.display, segOffline: segOff, acao: "notif-critico" });
        }
      }
    }

    return NextResponse.json({ ok: true, acoes });
  } catch (err) {
    console.error("[auto-recovery]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
