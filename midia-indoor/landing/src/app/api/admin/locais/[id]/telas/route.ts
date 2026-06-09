/**
 * GET /api/admin/locais/[id]/telas
 *
 * Lista as TVs do local. Estrategia robusta (resolve bug de DB desatualizado):
 *  1. Pega xibo_display_group_id do local
 *  2. Lista displays do grupo via Xibo (fonte da verdade)
 *  3. Match com midia_telas pelo xibo_display_id
 *  4. AUTO-BACKFILL: se a tela existe no DB mas com local_id != esse local,
 *     atualiza pra apontar pra ca (corrige drift de vinculacao antiga sem
 *     local_id populado).
 *  5. Se display existe no Xibo mas nao em midia_telas, ignora (TV nao
 *     registrada no SaaS — caso raro, aparece em "Telas orfas" do admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull, listarDisplaysDoGrupo } from "@/lib/xibo";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }

  await ensureSchema();
  const local = await db().query<{ xibo_display_group_id: number | null }>(
    `SELECT xibo_display_group_id FROM midia_locais WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!local) return NextResponse.json({ ok: false, error: "local nao encontrado" }, { status: 404 });

  // Lista displays do grupo do local via Xibo (fonte da verdade)
  let displayIds: number[] = [];
  let xiboInfo = new Map<number, { display: string; loggedIn: number; lastAccessed: string; clientAddress?: string; macAddress?: string }>();
  if (local.xibo_display_group_id) {
    try {
      const dispsDoGrupo = await listarDisplaysDoGrupo(local.xibo_display_group_id);
      displayIds = dispsDoGrupo.map(d => d.displayId);
      // Para info adicional (lastAccessed, loggedIn etc), busca full
      const all = await listarDisplaysFull();
      for (const d of all) {
        if (displayIds.includes(d.displayId)) {
          xiboInfo.set(d.displayId, {
            display: d.display, loggedIn: d.loggedIn ?? 0,
            lastAccessed: String(d.lastAccessed ?? ""),
            clientAddress: d.clientAddress, macAddress: d.macAddress,
          });
        }
      }
    } catch (e) { console.warn("[telas-do-local] xibo falhou:", (e as Error).message); }
  }

  // Busca midia_telas correspondentes (por xibo_display_id) — fonte da gondola_*
  const telasDb = displayIds.length > 0
    ? await db().query<{
        id: string; nome: string; xibo_display_id: number | null; local_id: string | null; status: string | null;
        gondola_media_id: number | null; gondola_nome: string | null; gondola_duracao_seg: number;
        gondola_layout_id: number | null; ip: string | null; mac: string | null;
      }>(
        `SELECT id, nome, xibo_display_id, local_id, status, gondola_media_id, gondola_nome,
                gondola_duracao_seg, gondola_layout_id, ip, mac
           FROM midia_telas WHERE xibo_display_id = ANY($1::int[])`,
        [displayIds]
      ).then(r => r.rows)
    : [];

  // AUTO-BACKFILL: atualiza local_id pra esse local nas telas que ainda nao apontam pra ca
  const naoVinculadas = telasDb.filter(t => t.local_id !== params.id);
  if (naoVinculadas.length > 0) {
    await db().query(
      `UPDATE midia_telas SET local_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`,
      [params.id, naoVinculadas.map(t => t.id)]
    );
    console.log(`[telas-do-local] auto-vinculou ${naoVinculadas.length} tela(s) ao local ${params.id}`);
  }

  // Monta resposta: 1 linha por displayId do grupo
  const telasPorXibo = new Map(telasDb.map(t => [t.xibo_display_id ?? -1, t]));
  const out = displayIds.map(did => {
    const t = telasPorXibo.get(did);
    const x = xiboInfo.get(did);
    return {
      id: t?.id ?? null,
      nome: t?.nome ?? x?.display ?? `Display ${did}`,
      xibo_display_id: did,
      status: t?.status ?? null,
      gondola_media_id: t?.gondola_media_id ?? null,
      gondola_nome: t?.gondola_nome ?? null,
      gondola_duracao_seg: t?.gondola_duracao_seg ?? 10,
      gondola_layout_id: t?.gondola_layout_id ?? null,
      ip: t?.ip ?? x?.clientAddress ?? null,
      mac: t?.mac ?? x?.macAddress ?? null,
      online: x ? x.loggedIn === 1 : null,
      ultimo_acesso: x?.lastAccessed ?? null,
      registrada_no_saas: Boolean(t),
    };
  });

  return NextResponse.json({ ok: true, telas: out, total_xibo: displayIds.length, auto_vinculadas: naoVinculadas.length });
}

export const GET = handle;
