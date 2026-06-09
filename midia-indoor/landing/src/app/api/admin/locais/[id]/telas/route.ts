/**
 * GET /api/admin/locais/[id]/telas
 * Lista as TVs vinculadas ao local (via midia_telas.local_id). Mostra info de
 * gondola por tela e estado online do Xibo.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull } from "@/lib/xibo";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }

  await ensureSchema();
  const telas = await db().query<{
    id: string; nome: string; xibo_display_id: number | null; status: string | null;
    gondola_media_id: number | null; gondola_nome: string | null; gondola_duracao_seg: number;
    gondola_layout_id: number | null; ip: string | null; mac: string | null;
  }>(
    `SELECT id, nome, xibo_display_id, status, gondola_media_id, gondola_nome,
            gondola_duracao_seg, gondola_layout_id, ip, mac
       FROM midia_telas WHERE local_id = $1 ORDER BY nome NULLS LAST, created_at`,
    [params.id]
  ).then(r => r.rows);

  // Enriquece com status online via Xibo
  const xiboMap = new Map<number, { loggedIn: number; lastAccessed: string }>();
  try {
    const all = await listarDisplaysFull();
    for (const d of all) xiboMap.set(d.displayId, { loggedIn: d.loggedIn ?? 0, lastAccessed: String(d.lastAccessed ?? "") });
  } catch { /* ignore */ }

  const enriched = telas.map(t => ({
    ...t,
    online: t.xibo_display_id ? (xiboMap.get(t.xibo_display_id)?.loggedIn === 1) : null,
    ultimo_acesso: t.xibo_display_id ? xiboMap.get(t.xibo_display_id)?.lastAccessed ?? null : null,
  }));

  return NextResponse.json({ ok: true, telas: enriched });
}

export const GET = handle;
