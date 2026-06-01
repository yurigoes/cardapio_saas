/**
 * Cliente da API do Xibo CMS.
 *
 * A landing/dashboard conversa com o Xibo por DENTRO (mesma rede Docker)
 * usando credenciais OAuth2 (Client Credentials) de uma Application criada
 * no Xibo (Administration → Applications).
 *
 * Modelo de isolamento por cliente (sem dar login Xibo pro cliente):
 *   - 1 Folder por cliente (isola a mídia)
 *   - 1 Display Group por cliente (agrupa as TVs dele)
 *   - A landing faz tudo via API admin, escopado na pasta/grupo do cliente
 *
 * Env necessárias:
 *   XIBO_URL            http://midia_xibo_web (interno) OU https://midia.tthreedigital.com.br
 *   XIBO_CLIENT_ID
 *   XIBO_CLIENT_SECRET
 */

const XIBO_URL = (process.env.XIBO_URL ?? "http://midia_xibo_web").replace(/\/+$/, "");
const CLIENT_ID = process.env.XIBO_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.XIBO_CLIENT_SECRET ?? "";

let _token: { value: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (_token && _token.exp > Date.now() + 30_000) return _token.value;

  const r = await fetch(`${XIBO_URL}/api/authorize/access_token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Xibo auth falhou ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json() as { access_token: string; expires_in: number };
  _token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return _token.value;
}

interface XiboOpts {
  method?: string;
  body?: URLSearchParams | FormData | string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

async function xibo<T = unknown>(path: string, opts: XiboOpts = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers ?? {}),
  };
  // URLSearchParams → form-urlencoded (a maioria dos POSTs do Xibo usa isso)
  if (opts.body instanceof URLSearchParams && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  // Default 30s; uploads grandes (FormData) ganham 5min
  const timeout = opts.timeoutMs ?? (opts.body instanceof FormData ? 5 * 60_000 : 30_000);
  const r = await fetch(`${XIBO_URL}${path}`, {
    method:  opts.method ?? "GET",
    headers,
    body:    opts.body,
    signal:  AbortSignal.timeout(timeout),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Xibo ${opts.method ?? "GET"} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  }
  try { return text ? JSON.parse(text) as T : ({} as T); }
  catch { return text as unknown as T; }
}

// ─── Folders (isolamento de mídia por cliente) ──────────────────────────────
export async function criarFolder(nome: string, parentId?: number): Promise<number> {
  const body = new URLSearchParams({ text: nome });
  if (parentId) body.set("parentId", String(parentId));
  const r = await xibo<{ id?: number; data?: { id: number } }>("/api/folders", { method: "POST", body });
  // Xibo retorna a folder criada; id pode vir em .id ou .data.id dependendo da versão
  const id = (r as { id?: number }).id ?? (r as { data?: { id: number } }).data?.id;
  if (!id) throw new Error("Xibo: criarFolder não retornou id");
  return id;
}

// ─── Display Group (agrupa as TVs do cliente) ───────────────────────────────
export async function criarDisplayGroup(nome: string, descricao = ""): Promise<number> {
  const body = new URLSearchParams({
    displayGroup: nome,
    description:  descricao,
    isDynamic:    "0",
  });
  const r = await xibo<{ displayGroupId?: number; data?: { displayGroupId: number } }>(
    "/api/displaygroup", { method: "POST", body }
  );
  const id = (r as { displayGroupId?: number }).displayGroupId
          ?? (r as { data?: { displayGroupId: number } }).data?.displayGroupId;
  if (!id) throw new Error("Xibo: criarDisplayGroup não retornou id");
  return id;
}

// ─── Upload de mídia (imagem/vídeo) pra pasta do cliente ────────────────────
export async function uploadMedia(
  arquivo: Buffer | Blob,
  nomeArquivo: string,
  folderId: number,
): Promise<{ mediaId: number; name: string }> {
  const form = new FormData();
  const blob = arquivo instanceof Blob ? arquivo : new Blob([new Uint8Array(arquivo)]);
  form.append("files", blob, nomeArquivo);
  form.append("folderId", String(folderId));

  const r = await xibo<{ files: Array<{ mediaId: number; name: string }> }>(
    "/api/library", { method: "POST", body: form }
  );
  const f = r.files?.[0];
  if (!f) throw new Error("Xibo: upload não retornou mediaId");
  return { mediaId: f.mediaId, name: f.name };
}

export interface XiboMedia {
  mediaId:   number;
  name:      string;
  mediaType: string;   // image | video | ...
  fileSize:  number;
  duration:  number;
  createdDt: string;
}

/** Lista a mídia de uma pasta do cliente. */
export async function listarMidias(folderId: number): Promise<XiboMedia[]> {
  const qs = new URLSearchParams({ folderId: String(folderId) });
  return xibo<XiboMedia[]>(`/api/library?${qs.toString()}`);
}

// ─── Displays (TVs) ─────────────────────────────────────────────────────────
export interface XiboDisplay {
  displayId:    number;
  display:      string;
  authorised:   number;     // 0 = pendente, 1 = autorizado
  loggedIn:     number;     // 0/1 online
  lastAccessed: string;
}

export async function listarDisplays(filtro?: { displayGroupId?: number }): Promise<XiboDisplay[]> {
  const qs = new URLSearchParams();
  if (filtro?.displayGroupId) qs.set("displayGroupId", String(filtro.displayGroupId));
  return xibo<XiboDisplay[]>(`/api/display?${qs.toString()}`);
}

export async function autorizarDisplay(displayId: number): Promise<void> {
  // Toggle de autorização no Xibo
  await xibo(`/api/display/authorise/${displayId}`, { method: "PUT" });
}

export async function adicionarDisplayAoGrupo(displayId: number, displayGroupId: number): Promise<void> {
  const body = new URLSearchParams();
  body.append("displayId[]", String(displayId));
  await xibo(`/api/displaygroup/${displayGroupId}/display/assign`, { method: "POST", body });
}

export async function removerDisplayDoGrupo(displayId: number, displayGroupId: number): Promise<void> {
  const body = new URLSearchParams();
  body.append("displayId[]", String(displayId));
  await xibo(`/api/displaygroup/${displayGroupId}/display/unassign`, { method: "POST", body });
}

export interface XiboDisplayFull extends XiboDisplay {
  description?: string;
  defaultLayoutId?: number;
  licensed?: number;
  license?: string;
  incSchedule?: number;
  emailAlert?: number;
  wakeOnLanEnabled?: number;
  clientType?: string;
  displayGroups?: { displayGroupId: number; displayGroup: string; isDisplaySpecific?: number }[];
}

/** Manda o(s) display(s) do grupo coletarem o conteúdo agora (push via XMR). */
export async function collectNow(displayGroupId: number): Promise<void> {
  await xibo(`/api/displaygroup/${displayGroupId}/action/collectNow`, { method: "POST" });
}

/** Lista displays com dados completos (status + grupos). */
export async function listarDisplaysFull(filtro?: { authorised?: number }): Promise<XiboDisplayFull[]> {
  const qs = new URLSearchParams({ embed: "displaygroups" });
  if (filtro?.authorised !== undefined) qs.set("authorised", String(filtro.authorised));
  return xibo<XiboDisplayFull[]>(`/api/display?${qs.toString()}`);
}

/** Renomeia um display (reenvia os campos obrigatórios do Xibo). */
export async function renomearDisplay(displayId: number, novoNome: string): Promise<void> {
  const atual = (await xibo<XiboDisplayFull[]>(`/api/display?displayId=${displayId}`))[0];
  if (!atual) throw new Error("display não encontrado");
  const body = new URLSearchParams();
  body.set("display", novoNome);
  body.set("defaultLayoutId", String(atual.defaultLayoutId ?? 0));
  body.set("licensed", String(atual.licensed ?? 1));
  body.set("license", String(atual.license ?? ""));
  body.set("incSchedule", String(atual.incSchedule ?? 0));
  body.set("emailAlert", String(atual.emailAlert ?? 0));
  body.set("wakeOnLanEnabled", String(atual.wakeOnLanEnabled ?? 0));
  await xibo(`/api/display/${displayId}`, { method: "PUT", body });
}

export async function excluirDisplay(displayId: number): Promise<void> {
  await xibo(`/api/display/${displayId}`, { method: "DELETE" });
}

export async function excluirLayout(layoutId: number): Promise<void> {
  await xibo(`/api/layout/${layoutId}`, { method: "DELETE" });
}

export async function excluirMidia(mediaId: number): Promise<void> {
  await xibo(`/api/library/${mediaId}`, { method: "DELETE" });
}

export interface XiboCampaignInfo {
  campaignId: number; campaign: string; type: string;
  startDt?: string | number | null; endDt?: string | number | null;
  numberLayouts?: number; layouts?: { layoutId: number }[];
}

/** Lista campanhas do Xibo (com layouts). */
export async function listarCampanhas(): Promise<XiboCampaignInfo[]> {
  const r = await xibo<XiboCampaignInfo[] | { data: XiboCampaignInfo[] }>(`/api/campaign?embed=layouts&retired=0`);
  return Array.isArray(r) ? r : (r.data ?? []);
}

// ─── Resoluções ─────────────────────────────────────────────────────────────
/** Acha (ou cria) uma resolução pelo tamanho e retorna o resolutionId. */
export async function getResolution(width: number, height: number): Promise<number> {
  const found = await xibo<Array<{ resolutionId: number }>>(`/api/resolution?width=${width}&height=${height}`);
  if (Array.isArray(found) && found[0]?.resolutionId) return found[0].resolutionId;
  const body = new URLSearchParams({ resolution: `${width}x${height}`, width: String(width), height: String(height) });
  const r = await xibo<{ resolutionId?: number; data?: { resolutionId: number } }>("/api/resolution", { method: "POST", body });
  const id = r.resolutionId ?? r.data?.resolutionId;
  if (!id) throw new Error("Xibo: não criou resolução");
  return id;
}

// ─── Layout a partir de uma única mídia (criativo do anunciante) ─────────────
interface DraftLayout {
  layoutId: number;
  parentId?: number | null;
  campaignId?: number;
  regions?: Array<{ regionPlaylist?: { playlistId: number } }>;
}

/**
 * Cria um layout fullscreen com a mídia do anunciante e publica.
 * Retorna o layoutId PUBLICADO (pra usar na Ad Campaign).
 */
export async function criarLayoutDeMidia(opts: {
  nome: string;
  arquivo: Buffer | Blob;
  nomeArquivo: string;
  folderId: number;
  width: number;
  height: number;
  duracaoSeg?: number;   // segundos por inserção (imagens). Vídeo usa duração nativa.
}): Promise<{ layoutId: number; mediaId: number; campaignId?: number }> {
  const resolutionId = await getResolution(opts.width, opts.height);

  // 1) Cria layout em rascunho. Resposta: layoutId=rascunho, parentId=publicado,
  //    campaignId já vem pronto, regions[0].regionPlaylist.playlistId p/ subir a mídia.
  const draftBody = new URLSearchParams({ name: opts.nome, resolutionId: String(resolutionId), returnDraft: "1" });
  const draft = await xibo<DraftLayout>("/api/layout", { method: "POST", body: draftBody });
  const editId      = draft.layoutId;                    // rascunho (onde subimos a mídia)
  const publishId   = draft.parentId ?? draft.layoutId;  // publica pelo layout PAI (publicado)
  const playlistId  = draft.regions?.[0]?.regionPlaylist?.playlistId;
  if (!playlistId) throw new Error("Xibo: layout criado sem playlist de região");

  // 2) Sobe a mídia direto na playlist da região.
  //    Nome único na biblioteca (Xibo recusa nomes duplicados).
  const form = new FormData();
  const blob = opts.arquivo instanceof Blob ? opts.arquivo : new Blob([new Uint8Array(opts.arquivo)]);
  const nomeUnico = `${Date.now().toString(36)}-${opts.nomeArquivo}`;
  form.append("files", blob, nomeUnico);
  form.append("name", nomeUnico);
  form.append("folderId", String(opts.folderId));
  form.append("playlistId", String(playlistId));
  const up = await xibo<{ files: Array<{ mediaId?: number; error?: string; name?: string }> }>("/api/library", { method: "POST", body: form });
  const mediaId = up.files?.[0]?.mediaId;
  if (!mediaId) {
    const motivo = up.files?.[0]?.error ?? JSON.stringify(up).slice(0, 300);
    throw new Error(`Xibo: upload do criativo falhou — ${motivo}`);
  }

  // 3) Ajusta a duração do widget (segundos por inserção), se pedido
  if (opts.duracaoSeg && opts.duracaoSeg > 0) {
    try {
      const widgets = await xibo<Array<{ widgetId: number }>>(`/api/playlist/widget?playlistId=${playlistId}`);
      const widgetId = Array.isArray(widgets) ? widgets[widgets.length - 1]?.widgetId : undefined;
      if (widgetId) {
        const wb = new URLSearchParams({ duration: String(opts.duracaoSeg), useDuration: "1" });
        await xibo(`/api/playlist/widget/${widgetId}`, { method: "PUT", body: wb });
      }
    } catch (e) { console.warn("[xibo] não setou duração do widget:", (e as Error).message); }
  }

  // 4) Publica (pelo layout pai)
  const pubBody = new URLSearchParams({ publishNow: "1" });
  await xibo(`/api/layout/publish/${publishId}`, { method: "PUT", body: pubBody });

  // 5) Resolve o layout PUBLICADO pelo nome único (id + campaignId corretos pós-publish).
  let layoutId = editId;
  let campaignId = draft.campaignId;
  try {
    const arr = await xibo<Array<{ layoutId: number; campaignId?: number; publishedStatusId?: number; layout?: string }>>(
      `/api/layout?layout=${encodeURIComponent(opts.nome)}&embed=campaigns&retired=0`
    );
    const lista = Array.isArray(arr) ? arr : [];
    const pub = lista.find(l => l.publishedStatusId === 1 && l.layout === opts.nome)
            ?? lista.find(l => l.layout === opts.nome) ?? lista[0];
    if (pub) { layoutId = pub.layoutId; campaignId = pub.campaignId ?? campaignId; }
  } catch (e) { console.warn("[xibo] não resolveu layout publicado:", (e as Error).message); }

  if (!campaignId) throw new Error("Xibo: layout publicado sem campaignId (não dá pra agendar)");
  return { layoutId, mediaId, campaignId };
}

/** Agenda um layout (via campaignId do layout) num display group, sempre ativo. Retorna o eventId. */
export async function agendarLayoutNoGrupo(campaignId: number, displayGroupId: number): Promise<number | undefined> {
  const agora = new Date();
  const fim = new Date(agora.getTime()); fim.setFullYear(fim.getFullYear() + 5);
  const body = new URLSearchParams();
  body.set("eventTypeId", "1");                 // 1 = Layout
  body.set("campaignId", String(campaignId));
  body.append("displayGroupIds[]", String(displayGroupId));
  body.set("displayOrder", "1");
  body.set("isPriority", "0");
  body.set("fromDt", fmtDt(agora));
  body.set("toDt", fmtDt(fim));
  const r = await xibo<{ eventId?: number; data?: { eventId: number } }>(`/api/schedule`, { method: "POST", body });
  return r.eventId ?? r.data?.eventId;
}

/** Remove um evento de agenda. */
export async function excluirEvento(eventId: number): Promise<void> {
  await xibo(`/api/schedule/${eventId}`, { method: "DELETE" });
}

/**
 * Cria um layout com VÁRIAS mídias em loop numa única região (conteúdo base).
 * Retorna o layoutId publicado + campaignId.
 */
export async function criarLayoutLoop(opts: {
  nome: string;
  arquivos: { arquivo: Buffer | Blob; nomeArquivo: string }[];
  folderId: number;
  width: number;
  height: number;
}): Promise<{ layoutId: number; campaignId?: number; enviados: number }> {
  if (!opts.arquivos.length) throw new Error("nenhum arquivo");
  const resolutionId = await getResolution(opts.width, opts.height);

  const draftBody = new URLSearchParams({ name: opts.nome, resolutionId: String(resolutionId), returnDraft: "1" });
  const draft = await xibo<DraftLayout>("/api/layout", { method: "POST", body: draftBody });
  const publishId = draft.parentId ?? draft.layoutId;
  const playlistId = draft.regions?.[0]?.regionPlaylist?.playlistId;
  if (!playlistId) throw new Error("Xibo: layout sem playlist de região");

  let enviados = 0;
  for (const f of opts.arquivos) {
    const form = new FormData();
    const blob = f.arquivo instanceof Blob ? f.arquivo : new Blob([new Uint8Array(f.arquivo)]);
    const nomeUnico = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${f.nomeArquivo}`;
    form.append("files", blob, nomeUnico);
    form.append("name", nomeUnico);
    form.append("folderId", String(opts.folderId));
    form.append("playlistId", String(playlistId));
    try {
      const up = await xibo<{ files: Array<{ mediaId?: number; error?: string }> }>("/api/library", { method: "POST", body: form });
      if (up.files?.[0]?.mediaId) enviados++;
      else console.warn("[loop] arquivo falhou:", up.files?.[0]?.error);
    } catch (e) { console.warn("[loop] upload falhou:", (e as Error).message); }
  }
  if (!enviados) throw new Error("nenhum arquivo subiu pro Xibo");

  await xibo(`/api/layout/publish/${publishId}`, { method: "PUT", body: new URLSearchParams({ publishNow: "1" }) });

  let layoutId = publishId; let campaignId = draft.campaignId;
  try {
    const arr = await xibo<Array<{ layoutId: number; campaignId?: number; publishedStatusId?: number; layout?: string }>>(
      `/api/layout?layout=${encodeURIComponent(opts.nome)}&embed=campaigns&retired=0`
    );
    const lista = Array.isArray(arr) ? arr : [];
    const pub = lista.find(l => l.publishedStatusId === 1 && l.layout === opts.nome) ?? lista.find(l => l.layout === opts.nome) ?? lista[0];
    if (pub) { layoutId = pub.layoutId; campaignId = pub.campaignId ?? campaignId; }
  } catch (e) { console.warn("[loop] não resolveu publicado:", (e as Error).message); }

  return { layoutId, campaignId, enviados };
}

// ─── Ad Campaigns (inserções automáticas) ────────────────────────────────────
function fmtDt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Cria uma Ad Campaign que toca o layout nos locais (display groups) escolhidos,
 * com alvo de `target` plays (inserções) entre as datas. O Xibo distribui sozinho.
 */
export async function criarAdCampaign(opts: {
  nome: string;
  layoutId: number;
  targetPlays: number;
  dataInicio: Date;
  dataFim: Date;
  displayGroupIds: number[];
}): Promise<number> {
  // 1) Cria a campanha (ad campaign NÃO aceita layoutIds na criação)
  const body = new URLSearchParams();
  body.set("type", "ad");
  body.set("name", opts.nome);
  body.set("targetType", "plays");
  body.set("target", String(opts.targetPlays));
  const created = await xibo<{ campaignId?: number; data?: { campaignId: number } }>("/api/campaign", { method: "POST", body });
  const campaignId = created.campaignId ?? created.data?.campaignId;
  if (!campaignId) throw new Error("Xibo: não criou ad campaign");

  // 2) Anexa o layout (criativo)
  const assign = new URLSearchParams();
  assign.set("layoutId", String(opts.layoutId));
  await xibo(`/api/campaign/layout/assign/${campaignId}`, { method: "POST", body: assign });

  // 3) Define datas + locais
  await editarAdCampaign(campaignId, {
    nome: opts.nome, targetPlays: opts.targetPlays,
    dataInicio: opts.dataInicio, dataFim: opts.dataFim, displayGroupIds: opts.displayGroupIds,
  });
  return campaignId;
}

export async function editarAdCampaign(campaignId: number, opts: {
  nome: string; targetPlays: number; dataInicio: Date; dataFim: Date; displayGroupIds: number[];
}): Promise<void> {
  const body = new URLSearchParams();
  body.set("name", opts.nome);
  body.set("targetType", "plays");
  body.set("target", String(opts.targetPlays));
  body.set("startDt", fmtDt(opts.dataInicio));
  body.set("endDt", fmtDt(opts.dataFim));
  for (const g of opts.displayGroupIds) body.append("displayGroupIds[]", String(g));
  await xibo(`/api/campaign/${campaignId}`, { method: "PUT", body });
}

/** Encerra a campanha (remove do ar). */
export async function excluirCampanha(campaignId: number): Promise<void> {
  await xibo(`/api/campaign/${campaignId}`, { method: "DELETE" });
}

export interface StatLinha { type: string; layoutId?: number; numberPlays: number; duration: number; }

/** Proof-of-play: total de exibições de uma campanha num período. */
export async function statsCampanha(campaignId: number, fromDt: string, toDt: string): Promise<{ plays: number; duracao: number; linhas: number }> {
  const qs = new URLSearchParams({ type: "Layout", campaignId: String(campaignId), fromDt, toDt });
  const r = await xibo<{ data?: StatLinha[] } | StatLinha[]>(`/api/stats?${qs.toString()}`);
  const linhas = Array.isArray(r) ? r : (r.data ?? []);
  const plays = linhas.reduce((s, l) => s + (Number(l.numberPlays) || 0), 0);
  const duracao = linhas.reduce((s, l) => s + (Number(l.duration) || 0), 0);
  return { plays, duracao, linhas: linhas.length };
}

export interface ExibicaoLinha {
  start: string;          // data/hora da exibição
  end: string;
  display: string;        // nome da tela/local
  displayId: number;
  numberPlays: number;
  duration: number;
}

/** Proof-of-play detalhado: cada registro de exibição com horário + tela (transparência). */
export async function statsDetalhe(campaignId: number, fromDt: string, toDt: string): Promise<ExibicaoLinha[]> {
  const qs = new URLSearchParams({ type: "Layout", campaignId: String(campaignId), fromDt, toDt, embed: "displayName" });
  const r = await xibo<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>(`/api/stats?${qs.toString()}`);
  const rows = Array.isArray(r) ? r : (r.data ?? []);
  return rows.map(row => ({
    start:       String(row.start ?? row.statDate ?? ""),
    end:         String(row.end ?? ""),
    display:     String(row.display ?? row.displayName ?? `Tela ${row.displayId ?? ""}`),
    displayId:   Number(row.displayId ?? 0),
    numberPlays: Number(row.numberPlays ?? 0),
    duration:    Number(row.duration ?? 0),
  })).filter(x => x.start);
}

/** Baixa o binário de uma mídia da biblioteca (pra preview/proxy). */
export async function baixarMidia(mediaId: number, tipo: "image" | "video"): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const token = await getToken();
  const r = await fetch(`${XIBO_URL}/api/library/download/${mediaId}/${tipo}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Xibo download ${mediaId} → ${r.status}`);
  return { buffer: await r.arrayBuffer(), contentType: r.headers.get("content-type") ?? (tipo === "video" ? "video/mp4" : "image/jpeg") };
}

// ─── Health/ping (testa credenciais) ────────────────────────────────────────
export async function pingXibo(): Promise<boolean> {
  try {
    await getToken();
    await xibo("/api/about");
    return true;
  } catch {
    return false;
  }
}
