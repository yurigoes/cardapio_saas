/**
 * POST /api/admin/campanhas/[id]/forcar-agendamento?key=CRON_SECRET
 *
 * Acelera quando a campanha foi lancada mas o Xibo CampaignSchedulerTask
 * ainda nao criou eventos (roda 1x/hora — pode ficar ate 1h sem tocar).
 *
 * O que faz:
 *  1. Pega o layout da campanha + display groups dos locais
 *  2. Resolve o "layout campaign id" (cada layout no Xibo tem campaign automatica)
 *     — se obterCampaignIdDoLayout falhar, usa o proprio layoutId (CMS 4.x trata igual)
 *  3. Cria/recria INTERRUPT schedule kick-start ate a proxima hora cheia
 *  4. collectNow em cada display group pra forcar o pull imediato
 *
 * Resultado: TV comeca a tocar em ~30s em vez de esperar 1h.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";
import { obterCampaignIdDoLayout, kickStartLayoutAteProximaHora, collectNow, xibo } from "@/lib/xibo";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }

  await ensureSchema();
  const p = db();

  const camp = await p.query<{
    id: string; nome: string; status: string; xibo_layout_id: number | null;
    xibo_campaign_id: number | null; insercoes_dia: number; dias_semana: string | null;
  }>(
    `SELECT id, nome, status, xibo_layout_id, xibo_campaign_id, insercoes_dia, dias_semana
       FROM midia_campanhas WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!camp) return NextResponse.json({ ok: false, error: "campanha nao encontrada" }, { status: 404 });
  if (!camp.xibo_layout_id) return NextResponse.json({ ok: false, error: "campanha sem layout" }, { status: 400 });

  // Display groups dos locais
  const groups = await p.query<{ xibo_display_group_id: number }>(
    `SELECT DISTINCT l.xibo_display_group_id
       FROM midia_campanha_locais cl
       JOIN midia_locais l ON l.id = cl.local_id
      WHERE cl.campanha_id = $1 AND l.xibo_display_group_id IS NOT NULL`,
    [params.id]
  ).then(r => r.rows.map(x => x.xibo_display_group_id));
  if (!groups.length) return NextResponse.json({ ok: false, error: "nenhum display group nos locais" }, { status: 400 });

  const log: string[] = [];
  log.push(`campanha: ${camp.nome} (layout ${camp.xibo_layout_id})`);
  log.push(`display groups: ${groups.join(", ")}`);

  // Resolve campaign id do layout (cada layout tem campaign automatica no Xibo)
  let layoutCampaignId = await obterCampaignIdDoLayout(camp.xibo_layout_id);
  if (!layoutCampaignId) {
    // Fallback: alguns Xibo retornam vazio em ?embed=campaigns; tenta direto via /api/campaign?layoutId
    try {
      const r = await xibo<Array<{ campaignId: number }>>(`/api/campaign?layoutId=${camp.xibo_layout_id}&isLayoutSpecific=1`);
      layoutCampaignId = r[0]?.campaignId ?? null;
    } catch (e) { log.push(`fallback layout->campaign falhou: ${(e as Error).message}`); }
  }
  if (!layoutCampaignId) return NextResponse.json({ ok: false, error: "nao consegui resolver campaignId do layout — layout pode estar corrompido", log }, { status: 500 });
  log.push(`layoutCampaignId resolvido: ${layoutCampaignId}`);

  // Kick-start ate a proxima hora cheia
  const playsHora = Math.max(1, Math.ceil(camp.insercoes_dia / 12));
  let eventId: number | undefined;
  try {
    eventId = await kickStartLayoutAteProximaHora(layoutCampaignId, groups, playsHora, camp.dias_semana ?? undefined);
    log.push(eventId ? `kick-start OK: eventId ${eventId}` : "kick-start nao criado (provavelmente ja virou a hora)");
  } catch (e) {
    log.push(`kick-start FALHOU: ${(e as Error).message}`);
    return NextResponse.json({ ok: false, error: (e as Error).message, log }, { status: 500 });
  }

  // collectNow em cada grupo pra forcar pull XMR push
  const collects: Array<{ groupId: number; ok: boolean; erro?: string }> = [];
  for (const g of groups) {
    try {
      const r = await collectNow(g);
      collects.push({ groupId: g, ok: r.ok });
      log.push(`collectNow group ${g}: ${r.mensagem}`);
    } catch (e) {
      collects.push({ groupId: g, ok: false, erro: (e as Error).message });
      log.push(`collectNow group ${g} FALHOU: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, campanha: camp.nome, layoutCampaignId, eventId, collects, log });
}

export const POST = handle;
export const GET = handle; // pra facilitar curl via SSH
