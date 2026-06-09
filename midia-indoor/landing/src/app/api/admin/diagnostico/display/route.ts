/**
 * GET /api/admin/diagnostico/display?ip=192.168.15.50
 * GET /api/admin/diagnostico/display?mac=xx:xx:xx:xx:xx:xx
 * GET /api/admin/diagnostico/display?displayId=12
 *
 * Diagnostico completo de "por que a TV nao esta tocando a campanha":
 *  1. Estado do display no Xibo (loggedIn, lastAccessed, defaultLayoutId, mediaInventoryStatus)
 *  2. Display Groups que o display participa
 *  3. Schedule events ativos hoje
 *  4. Ad Campaigns vinculadas a cada grupo (com layout e status)
 *  5. Diagnostico: lista hipoteses ordenadas por probabilidade
 *
 * Use no admin pra ver onde a programacao esta travada.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull, eventosDoDisplay, listarCampanhas, obterCampaignIdDoLayout, xibo } from "@/lib/xibo";

export const dynamic = "force-dynamic";

interface AdCampaignXibo {
  campaignId: number;
  campaign: string;
  type?: string;       // 'ad' ou 'list'
  startDt?: string;
  endDt?: string;
  targetType?: string;
  target?: number;
  numberPlays?: number;
  status?: number;     // 1=active
  layouts?: Array<{ layoutId: number; layout?: string; daysOfWeek?: string | number[] }>;
  displayGroupIds?: number[];
}

interface LayoutXibo {
  layoutId: number;
  layout: string;
  status?: number;     // 1=published, 2=draft, 3=needs build, 4=error
  publishedStatusId?: number;
  duration?: number;
}

interface ScheduleEvt {
  eventId: number;
  campaignId?: number;
  campaign?: string;
  fromDt?: string;
  toDt?: string;
  dayPartId?: number;
  eventTypeId?: number;
}

interface Hipotese { gravidade: "alta" | "media" | "baixa"; texto: string; acao?: string; }

async function handle(req: NextRequest) {
  // Aceita master cookie OU ?key=CRON_SECRET pra debug via curl/SSH na VPS
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }
  await ensureSchema();

  const ip  = req.nextUrl.searchParams.get("ip");
  const mac = req.nextUrl.searchParams.get("mac");
  const idQ = req.nextUrl.searchParams.get("displayId");
  let displayId: number | null = idQ ? Number(idQ) : null;

  // Resolve displayId via DB se nao foi passado direto
  if (!displayId) {
    const where: string[] = []; const args: unknown[] = [];
    if (ip)  { args.push(ip);  where.push(`ip = $${args.length}`); }
    if (mac) { args.push(mac); where.push(`LOWER(mac) = LOWER($${args.length})`); }
    if (!where.length) return NextResponse.json({ ok: false, error: "passe ip, mac ou displayId" }, { status: 400 });
    const row = await db().query<{ xibo_display_id: number | null }>(
      `SELECT xibo_display_id FROM midia_telas WHERE ${where.join(" OR ")} LIMIT 1`, args
    ).then(r => r.rows[0]);
    displayId = row?.xibo_display_id ?? null;
    if (!displayId) return NextResponse.json({ ok: false, error: "display nao encontrado no DB (ou nao tem xibo_display_id)" }, { status: 404 });
  }

  // 1) Estado do display no Xibo
  const todosDisplays = await listarDisplaysFull();
  const disp = todosDisplays.find(d => d.displayId === displayId);
  if (!disp) return NextResponse.json({ ok: false, error: `display ${displayId} nao existe no Xibo` }, { status: 404 });

  const grupos = disp.displayGroups ?? [];
  const gruposNaoEspecificos = grupos.filter(g => g.isDisplaySpecific !== 1);
  const grupoProprio = grupos.find(g => g.isDisplaySpecific === 1);

  // 2) Schedule events hoje
  const hoje = new Date().toISOString().slice(0, 10);
  const eventos = (await eventosDoDisplay(displayId, hoje)) as unknown as ScheduleEvt[];

  // 3) Ad campaigns ativas ligadas a CADA grupo (nao especifico)
  const campanhasDoXibo = (await listarCampanhas()) as unknown as AdCampaignXibo[];
  const grupoIds = new Set(gruposNaoEspecificos.map(g => g.displayGroupId));
  const adsRelevantes: Array<AdCampaignXibo & { layoutsState: LayoutXibo[]; cobreEsseDisplay: boolean }> = [];
  for (const c of campanhasDoXibo) {
    if (c.type !== "ad") continue;
    // Algumas versoes do Xibo retornam displayGroupIds, outras precisam embed=displayGroups
    let dgIds: number[] = c.displayGroupIds ?? [];
    if (!dgIds.length) {
      try {
        const full = await xibo<Array<{ displayGroups?: Array<{ displayGroupId: number }> }>>(
          `/api/campaign?campaignId=${c.campaignId}&embed=displayGroups`
        );
        dgIds = (full[0]?.displayGroups ?? []).map((g: { displayGroupId: number }) => g.displayGroupId);
      } catch { /* ignore */ }
    }
    const cobre = dgIds.some(g => grupoIds.has(g));
    if (!cobre) continue;

    // Estado dos layouts da campanha
    const layoutsIds = (c.layouts ?? []).map(l => l.layoutId).filter(Boolean);
    const layoutsState: LayoutXibo[] = [];
    for (const lid of layoutsIds) {
      try {
        const l = await xibo<LayoutXibo[]>(`/api/layout?layoutId=${lid}`);
        if (l[0]) layoutsState.push(l[0]);
      } catch { /* ignore */ }
    }
    adsRelevantes.push({ ...c, displayGroupIds: dgIds, layoutsState, cobreEsseDisplay: cobre });
  }

  // 4) DB do SaaS: campanhas que apontam pros grupos deste display
  const campanhasDoSaas = await db().query<{ id: string; nome: string; status: string; xibo_campaign_id: number | null; xibo_layout_id: number | null; data_inicio: string; data_fim: string }>(
    `SELECT DISTINCT c.id, c.nome, c.status, c.xibo_campaign_id, c.xibo_layout_id, c.data_inicio, c.data_fim
       FROM midia_campanhas c
       JOIN midia_campanha_locais cl ON cl.campanha_id = c.id
       JOIN midia_locais l ON l.id = cl.local_id
      WHERE l.xibo_display_group_id = ANY($1::int[])
        AND c.status IN ('no_ar', 'aguardando_lancamento', 'pausada')`,
    [Array.from(grupoIds)]
  ).then(r => r.rows);

  // 5) Diagnostico — hipoteses ordenadas
  const hipoteses: Hipotese[] = [];
  const now = Date.now();
  const ultimoAcessoMs = disp.lastAccessed ? Number(disp.lastAccessed) * 1000 : 0;
  const minDesdeAcesso = ultimoAcessoMs ? Math.round((now - ultimoAcessoMs) / 60000) : null;

  if (!disp.loggedIn) {
    hipoteses.push({ gravidade: "alta", texto: "Display marcado como OFFLINE (loggedIn=0) no Xibo", acao: "Verifique conexao do player ou force restart do Xibo Player" });
  }
  if (minDesdeAcesso !== null && minDesdeAcesso > 10) {
    hipoteses.push({ gravidade: "media", texto: `Ultimo collect ha ${minDesdeAcesso} minutos`, acao: "Player pode estar com colectionInterval alto ou rede instavel" });
  }
  if (gruposNaoEspecificos.length === 0) {
    hipoteses.push({ gravidade: "alta", texto: "Display NAO esta em nenhum Display Group de Local", acao: "Use 'parear TV' no painel pra vincular ao grupo do local" });
  }
  if (eventos.length === 0 && adsRelevantes.length === 0) {
    hipoteses.push({ gravidade: "alta", texto: "Nenhum schedule event hoje E nenhuma Ad Campaign cobrindo os grupos", acao: "Re-lance a campanha (botao 'Lancar' no admin) — vai rodar kick-start" });
  }
  if (eventos.length === 0 && adsRelevantes.length > 0) {
    hipoteses.push({ gravidade: "media", texto: `${adsRelevantes.length} Ad Campaign(s) ativa(s) mas SEM evento agendado hoje`, acao: "CampaignSchedulerTask do Xibo roda 1x/hora — pode estar atrasado. Force kick-start re-lancando a campanha" });
  }
  for (const ad of adsRelevantes) {
    for (const l of ad.layoutsState) {
      if (l.status === 3) hipoteses.push({ gravidade: "alta", texto: `Layout '${l.layout}' (id ${l.layoutId}) esta em 'Needs Build'`, acao: "Faltou build/publish — re-anexe a arte" });
      if (l.status === 4) hipoteses.push({ gravidade: "alta", texto: `Layout '${l.layout}' (id ${l.layoutId}) esta em ERROR`, acao: "Layout corrompido — recriar via soft-recreate" });
      if (l.publishedStatusId === 2) hipoteses.push({ gravidade: "media", texto: `Layout '${l.layout}' esta em DRAFT (nao publicado)`, acao: "Publish do layout faltando" });
    }
    if (ad.startDt && new Date(ad.startDt).getTime() > now) {
      hipoteses.push({ gravidade: "media", texto: `Ad Campaign '${ad.campaign}' so comeca em ${ad.startDt}`, acao: "Aguarde o periodo OU edite data_inicio pra agora" });
    }
    if (ad.endDt && new Date(ad.endDt).getTime() < now) {
      hipoteses.push({ gravidade: "alta", texto: `Ad Campaign '${ad.campaign}' JA EXPIROU em ${ad.endDt}`, acao: "Estender data_fim ou encerrar" });
    }
  }

  // Verifica campanhas do SaaS sem xibo_campaign_id (nunca foram lancadas)
  for (const cs of campanhasDoSaas) {
    if (!cs.xibo_campaign_id) {
      hipoteses.push({ gravidade: "alta", texto: `Campanha SaaS '${cs.nome}' status='${cs.status}' SEM xibo_campaign_id`, acao: "Foi lancada? Confira logs do POST /api/admin/campanhas/[id]/lancar" });
    } else {
      const layoutOk = await obterCampaignIdDoLayout(cs.xibo_layout_id ?? 0);
      if (cs.xibo_layout_id && layoutOk === null) {
        hipoteses.push({ gravidade: "alta", texto: `Campanha '${cs.nome}' aponta pra layout ${cs.xibo_layout_id} que NAO existe no Xibo`, acao: "Rode /api/cron/health-check-layouts pra soft-recreate" });
      }
    }
  }

  if (hipoteses.length === 0) {
    hipoteses.push({ gravidade: "baixa", texto: "Nenhum problema obvio detectado — campanha esta agendada e layout publicado", acao: "Se mesmo assim nao toca, verifique mediaInventoryStatus e force collect" });
  }

  return NextResponse.json({
    ok: true,
    display: {
      displayId: disp.displayId,
      display: disp.display,
      ip: disp.clientAddress,
      mac: disp.macAddress,
      loggedIn: disp.loggedIn,
      lastAccessed: disp.lastAccessed,
      minutosDesdeAcesso: minDesdeAcesso,
      defaultLayoutId: disp.defaultLayoutId,
      clientType: disp.clientType,
      licensed: disp.licensed,
    },
    grupos: gruposNaoEspecificos,
    grupoProprio,
    eventos_hoje: eventos,
    ad_campaigns_relevantes: adsRelevantes.map(a => ({
      campaignId: a.campaignId, campaign: a.campaign,
      startDt: a.startDt, endDt: a.endDt,
      numberPlays: a.numberPlays, target: a.target,
      status: a.status,
      layouts: a.layoutsState.map(l => ({ layoutId: l.layoutId, layout: l.layout, status: l.status, publishedStatusId: l.publishedStatusId })),
      displayGroupIds: a.displayGroupIds,
    })),
    campanhas_saas: campanhasDoSaas,
    hipoteses,
  });
}

export const GET = handle;
