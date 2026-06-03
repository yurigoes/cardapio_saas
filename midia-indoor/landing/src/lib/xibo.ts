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

// ─── Ativação de display por código (Add by Code do Xibo) ──────────────────
/**
 * Ativa uma TV pelo código exibido no player Xibo recém-instalado.
 * O fluxo do Xibo 3.x:
 *   1) POST /api/display/addViaCode { user_code } — envia o CMS pra auth.signlicence.co.uk
 *   2) Player polla a URL → recebe addr+key do CMS → se registra (aparece no /api/display)
 *   3) Polling local (até ~45s) procurando o display novo (lastAccessed nos últimos 60s)
 *   4) Autoriza (licensed=1) o display encontrado e devolve o displayId
 */
export async function ativarDisplayPorCodigo(codigo: string, nome?: string): Promise<{ displayId: number }> {
  const code = codigo.trim();
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) throw new Error("código inválido");

  // 1) Snapshot dos displayIds existentes ANTES da ativação
  const antes = new Set<number>();
  try {
    const lista = await xibo<Array<{ displayId: number }>>(`/api/display`);
    for (const d of Array.isArray(lista) ? lista : []) antes.add(d.displayId);
  } catch (e) { console.warn("[ativar] snapshot inicial falhou:", (e as Error).message); }

  // 2) Manda o código pro Xibo (endpoint REAL é /api/display/addViaCode com user_code).
  //    IMPORTANTE: o Xibo pega o Host header pra gerar a URL do CMS que será enviada
  //    ao servidor de auth (auth.signlicence.co.uk). Se XIBO_URL aponta pro container
  //    interno (ex: midia_xibo_web), o player não vai conseguir acessar.
  //    Solução: setar XIBO_PUBLIC_URL=https://xibo.seu-dominio.com.br no .env.
  const body = new URLSearchParams({ user_code: code });
  const publicUrl = process.env.XIBO_PUBLIC_URL ?? "";
  if (publicUrl) {
    // chama o endpoint usando a URL pública, com Host correto pro HttpsDetect funcionar
    const pubBase = publicUrl.replace(/\/$/, "");
    const token = await getToken();
    const host = new URL(pubBase).host;
    const r = await fetch(`${pubBase}/api/display/addViaCode`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Host": host,
        "X-Forwarded-Host": host,
        "X-Forwarded-Proto": new URL(pubBase).protocol.replace(":", ""),
      },
      body: body.toString(),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Xibo addViaCode (pub) ${r.status}: ${t.slice(0, 200)}`);
    }
  } else {
    await xibo(`/api/display/addViaCode`, { method: "POST", body });
  }

  // 3) Polling até 45s procurando o display novo
  let novo: { displayId: number } | undefined;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const lista = await xibo<Array<{ displayId: number; display: string; lastAccessed?: number }>>(`/api/display`);
      novo = (Array.isArray(lista) ? lista : []).find(d => !antes.has(d.displayId));
      if (novo) break;
    } catch (e) { /* tenta de novo */ }
  }
  if (!novo) throw new Error("código aceito mas a TV ainda não se conectou. Confirme que o player tem internet e tente novamente em alguns segundos.");

  // 4) Autoriza + renomeia
  try {
    const upd = new URLSearchParams();
    upd.set("display", nome ?? `TV ${code}`);
    upd.set("licensed", "1");
    await xibo(`/api/display/${novo.displayId}`, { method: "PUT", body: upd });
  } catch (e) { console.warn("[ativar] autorizar/renomear falhou:", (e as Error).message); }

  return { displayId: novo.displayId };
}

/** Adiciona um display a um display group (link). */
export async function vincularDisplayAoGrupo(displayId: number, displayGroupId: number): Promise<void> {
  const body = new URLSearchParams();
  body.append("displayId[]", String(displayId));
  await xibo(`/api/displaygroup/${displayGroupId}/display/assign`, { method: "POST", body });
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

/** Define o Default Layout (layout exibido quando não há agendamento ativo). */
export async function setDefaultLayout(displayId: number, layoutId: number): Promise<void> {
  const atual = (await xibo<XiboDisplayFull[]>(`/api/display?displayId=${displayId}`))[0];
  if (!atual) throw new Error("display não encontrado");
  const body = new URLSearchParams();
  body.set("display", atual.display);
  body.set("defaultLayoutId", String(layoutId));
  body.set("licensed", String(atual.licensed ?? 1));
  body.set("license", String(atual.license ?? ""));
  body.set("incSchedule", String(atual.incSchedule ?? 0));
  body.set("emailAlert", String(atual.emailAlert ?? 0));
  body.set("wakeOnLanEnabled", String(atual.wakeOnLanEnabled ?? 0));
  await xibo(`/api/display/${displayId}`, { method: "PUT", body });
}

/** Lista displays de um display group. */
export async function listarDisplaysDoGrupo(displayGroupId: number): Promise<XiboDisplayFull[]> {
  return xibo<XiboDisplayFull[]>(`/api/display?displayGroupId=${displayGroupId}&embed=displaygroups`);
}

/** Pede ao player pra tirar uma screenshot da tela atual (via XMR). */
export async function pedirScreenshot(displayId: number): Promise<void> {
  await xibo(`/api/display/requestscreenshot/${displayId}`, { method: "PUT" });
}

/**
 * Baixa a última screenshot do display.
 * O Xibo NÃO expõe screenshots via API REST — o arquivo só é servido pela web UI
 * (autenticada por sessão). Caminhos suportados, em ordem:
 *   1) Filesystem direto via XIBO_LIBRARY_PATH (preferido) — monte a library do Xibo no container
 *   2) HTTP com Bearer (não funciona em 3.x, deixamos como fallback)
 */
export async function baixarScreenshot(displayId: number): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  // 1) Filesystem
  const libPath = process.env.XIBO_LIBRARY_PATH ?? "";
  if (libPath) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const candidatos = [
        path.join(libPath, "screenshots", `${displayId}_screenshot.jpg`),
        path.join(libPath, "screenshots", `${displayId}.jpg`),
      ];
      for (const fp of candidatos) {
        try {
          const buf = await fs.readFile(fp);
          // Verifica se não está vazio
          if (buf.length > 100) return { buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), contentType: "image/jpeg" };
        } catch { /* tenta próximo */ }
      }
    } catch (e) { console.warn("[baixarScreenshot] fs falhou:", (e as Error).message); }
  }
  // 2) HTTP (fallback — geralmente 403/404 em 3.x)
  const token = await getToken();
  for (const path of [`/library/screenshots/${displayId}_screenshot.jpg`, `/library/screenshots/${displayId}.jpg`]) {
    try {
      const r = await fetch(`${XIBO_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 100) return { buffer: buf, contentType: r.headers.get("content-type") ?? "image/jpeg" };
      }
    } catch { /* tenta próximo */ }
  }
  return null;
}

/** Cria um DayPart (janela de horário) no Xibo. fromTime/toTime no formato HH:MM. */
export async function criarDayPart(nome: string, fromTime: string, toTime: string): Promise<number> {
  const body = new URLSearchParams();
  body.set("name", nome);
  body.set("isCustom", "1");
  body.set("isAlways", "0");
  body.set("startTime", fromTime.length === 5 ? `${fromTime}:00` : fromTime);
  body.set("endTime",   toTime.length === 5   ? `${toTime}:00`   : toTime);
  const r = await xibo<{ dayPartId?: number; data?: { dayPartId: number } }>("/api/daypart", { method: "POST", body });
  const id = r.dayPartId ?? r.data?.dayPartId;
  if (!id) throw new Error("Xibo: não criou dayPart");
  return id;
}

/** Anexa layout a uma ad campaign com dayPartId opcional (day-parting). */
export async function anexarLayoutComDayPart(campaignId: number, layoutId: number, dayPartId?: number): Promise<void> {
  const body = new URLSearchParams();
  body.set("layoutId", String(layoutId));
  body.set("displayOrder", "1");
  // Sem daysOfWeek o CampaignSchedulerTask do Xibo pula a campanha (explode(',', NULL) → array vazio).
  for (const d of [1, 2, 3, 4, 5, 6, 7]) body.append("daysOfWeek[]", String(d));
  if (dayPartId) body.set("dayPartId", String(dayPartId));
  await xibo(`/api/campaign/layout/assign/${campaignId}`, { method: "POST", body });
}

/** Wake-on-LAN — liga a TV/box (se suportar). */
export async function wolDisplay(displayId: number): Promise<void> {
  await xibo(`/api/display/wol/${displayId}`, { method: "POST" });
}

/** Reverte o player pro schedule normal (cancela mudança de layout temporária). */
export async function revertToSchedule(displayGroupId: number): Promise<void> {
  await xibo(`/api/displaygroup/${displayGroupId}/action/revertToSchedule`, { method: "POST" });
}

/** Atribui um Display Profile (ex: Retrato vs Paisagem) a uma tela. */
export async function setDisplayProfile(displayId: number, displayProfileId: number): Promise<void> {
  const atual = (await xibo<XiboDisplayFull[]>(`/api/display?displayId=${displayId}`))[0];
  if (!atual) throw new Error("display não encontrado");
  const body = new URLSearchParams();
  body.set("display", atual.display);
  body.set("defaultLayoutId", String(atual.defaultLayoutId ?? 0));
  body.set("licensed", String(atual.licensed ?? 1));
  body.set("license", String(atual.license ?? ""));
  body.set("incSchedule", String(atual.incSchedule ?? 0));
  body.set("emailAlert", String(atual.emailAlert ?? 0));
  body.set("wakeOnLanEnabled", String(atual.wakeOnLanEnabled ?? 0));
  body.set("displayProfileId", String(displayProfileId));
  await xibo(`/api/display/${displayId}`, { method: "PUT", body });
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

// ─── Templates multi-zona (várias regiões) ──────────────────────────────────
export interface RegionSpec {
  /** porcentagens 0–100 (left/top/width/height) */
  left: number; top: number; width: number; height: number;
  zIndex?: number;
  /** widgets a inserir nessa região (ordem = ordem de exibição) */
  widgets?: Array<
    | { tipo: "midia"; arquivo: Buffer | Blob; nomeArquivo: string; duracaoSeg?: number }
    | { tipo: "rss"; uri: string; duracaoSeg?: number; titulo?: string }
    | { tipo: "clima"; latitude: number; longitude: number; duracaoSeg?: number; useDisplayLocation?: boolean }
    | { tipo: "relogio"; formato?: string; duracaoSeg?: number }
    | { tipo: "texto"; texto: string; duracaoSeg?: number }
  >;
}

/**
 * Cria um layout multi-zona com regiões posicionadas e widgets já configurados.
 * Útil para templates como "vídeo + ticker RSS" ou "imagem + clima + relógio".
 */
export async function criarLayoutMultiZona(opts: {
  nome: string; folderId: number; width: number; height: number;
  regions: RegionSpec[];
}): Promise<{ layoutId: number; campaignId?: number }> {
  if (!opts.regions.length) throw new Error("template precisa de pelo menos 1 região");
  const resolutionId = await getResolution(opts.width, opts.height);

  // 1) Cria layout rascunho — vem com 1 região padrão. Vamos adicionar mais conforme spec.
  const draft = await xibo<DraftLayout>("/api/layout", { method: "POST", body: new URLSearchParams({ name: opts.nome, resolutionId: String(resolutionId), returnDraft: "1" }) });
  const editId    = draft.layoutId;
  const publishId = draft.parentId ?? draft.layoutId;
  const firstPlaylistId = draft.regions?.[0]?.regionPlaylist?.playlistId;
  if (!firstPlaylistId) throw new Error("Xibo: layout sem playlist inicial");

  // 2) Posiciona/cria as regiões. A 1ª reaproveita a default; as demais vêm de POST /region.
  const playlistIds: number[] = [];
  for (let i = 0; i < opts.regions.length; i++) {
    const r = opts.regions[i];
    const w = Math.round(opts.width  * r.width  / 100);
    const h = Math.round(opts.height * r.height / 100);
    const x = Math.round(opts.width  * r.left   / 100);
    const y = Math.round(opts.height * r.top    / 100);
    if (i === 0) {
      // Atualiza a região default p/ a posição/tamanho da 1ª região do template
      try {
        const layoutEdit = await xibo<DraftLayout & { regions?: Array<{ regionId: number; regionPlaylist?: { playlistId: number } }> }>(`/api/layout?layoutId=${editId}&embed=regions,playlists`);
        const regionId = Array.isArray(layoutEdit) ? layoutEdit[0]?.regions?.[0]?.regionId : undefined;
        if (regionId) {
          await xibo(`/api/region/${regionId}`, { method: "PUT", body: new URLSearchParams({ width: String(w), height: String(h), top: String(y), left: String(x), zIndex: String(r.zIndex ?? 0) }) });
        }
      } catch (e) { console.warn("[multi-zona] não ajustou região 0:", (e as Error).message); }
      playlistIds.push(firstPlaylistId);
    } else {
      const body = new URLSearchParams({ width: String(w), height: String(h), top: String(y), left: String(x), zIndex: String(r.zIndex ?? 0) });
      const created = await xibo<{ regionPlaylist?: { playlistId: number }; playlists?: Array<{ playlistId: number }> }>(`/api/region/${editId}`, { method: "POST", body });
      const pid = created.regionPlaylist?.playlistId ?? created.playlists?.[0]?.playlistId;
      if (!pid) throw new Error("Xibo: região criada sem playlist");
      playlistIds.push(pid);
    }
  }

  // 3) Insere os widgets em cada região
  for (let i = 0; i < opts.regions.length; i++) {
    const r = opts.regions[i];
    const playlistId = playlistIds[i];
    for (const w of r.widgets ?? []) {
      try {
        if (w.tipo === "midia") {
          const form = new FormData();
          const blob = w.arquivo instanceof Blob ? w.arquivo : new Blob([new Uint8Array(w.arquivo)]);
          const nomeUnico = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${w.nomeArquivo}`;
          form.append("files", blob, nomeUnico); form.append("name", nomeUnico);
          form.append("folderId", String(opts.folderId)); form.append("playlistId", String(playlistId));
          const up = await xibo<{ files: Array<{ mediaId?: number }> }>("/api/library", { method: "POST", body: form });
          const mid = up.files?.[0]?.mediaId;
          if (mid && w.duracaoSeg) await ajustarUltimoWidget(playlistId, { duration: w.duracaoSeg });
        } else if (w.tipo === "rss") {
          await adicionarWidget(playlistId, "ticker", { sourceId: "1", uri: w.uri, duration: w.duracaoSeg ?? 60, useDuration: 1, name: w.titulo ?? "RSS" });
        } else if (w.tipo === "clima") {
          await adicionarWidget(playlistId, "forecastio", { useDisplayLocation: w.useDisplayLocation ? 1 : 0, latitude: w.latitude, longitude: w.longitude, duration: w.duracaoSeg ?? 30, useDuration: 1 });
        } else if (w.tipo === "relogio") {
          await adicionarWidget(playlistId, "clock", { clockTypeId: "1", format: w.formato ?? "HH:mm", duration: w.duracaoSeg ?? 30, useDuration: 1 });
        } else if (w.tipo === "texto") {
          await adicionarWidget(playlistId, "text", { text: w.texto, duration: w.duracaoSeg ?? 15, useDuration: 1 });
        }
      } catch (e) { console.warn(`[multi-zona] widget ${w.tipo} falhou:`, (e as Error).message); }
    }
  }

  // 4) Publica
  await xibo(`/api/layout/publish/${publishId}`, { method: "PUT", body: new URLSearchParams({ publishNow: "1" }) });

  // 5) Resolve o id publicado
  let layoutId = publishId; let campaignId = draft.campaignId;
  try {
    const arr = await xibo<Array<{ layoutId: number; campaignId?: number; publishedStatusId?: number; layout?: string }>>(
      `/api/layout?layout=${encodeURIComponent(opts.nome)}&embed=campaigns&retired=0`
    );
    const lista = Array.isArray(arr) ? arr : [];
    const pub = lista.find(l => l.publishedStatusId === 1 && l.layout === opts.nome) ?? lista.find(l => l.layout === opts.nome) ?? lista[0];
    if (pub) { layoutId = pub.layoutId; campaignId = pub.campaignId ?? campaignId; }
  } catch (e) { console.warn("[multi-zona] não resolveu publicado:", (e as Error).message); }
  return { layoutId, campaignId };
}

/** Adiciona um widget novo no fim da playlist. Retorna widgetId. */
async function adicionarWidget(playlistId: number, modulo: string, props: Record<string, string | number>): Promise<number | undefined> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(props)) body.set(k, String(v));
  const r = await xibo<{ widgetId?: number; data?: { widgetId: number } }>(`/api/playlist/widget/${modulo}/${playlistId}`, { method: "POST", body });
  return r.widgetId ?? r.data?.widgetId;
}

/** Ajusta props do último widget de uma playlist (útil pra setar duração de mídia recém-subida). */
async function ajustarUltimoWidget(playlistId: number, props: Record<string, string | number>): Promise<void> {
  const widgets = await xibo<Array<{ widgetId: number }>>(`/api/playlist/widget?playlistId=${playlistId}`);
  const widgetId = Array.isArray(widgets) ? widgets[widgets.length - 1]?.widgetId : undefined;
  if (!widgetId) return;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(props)) body.set(k, String(v));
  body.set("useDuration", "1");
  await xibo(`/api/playlist/widget/${widgetId}`, { method: "PUT", body });
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
  dayPartId?: number;
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

  // 2) Anexa o layout (criativo) com dayPart opcional
  const assign = new URLSearchParams();
  assign.set("layoutId", String(opts.layoutId));
  assign.set("displayOrder", "1");
  // Sem daysOfWeek o CampaignSchedulerTask pula (explode(',', NULL) vira array vazio)
  for (const d of [1, 2, 3, 4, 5, 6, 7]) assign.append("daysOfWeek[]", String(d));
  if (opts.dayPartId) assign.set("dayPartId", String(opts.dayPartId));
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

/**
 * Garante que o layout atual seja o único anexado à ad campaign:
 * 1) busca os layouts atualmente anexados
 * 2) desanexa todos
 * 3) anexa o novo layoutId (com dayPart opcional)
 */
export async function reassignLayoutNaAdCampaign(campaignId: number, novoLayoutId: number, dayPartId?: number): Promise<void> {
  // 1) Lista atual de layouts da campaign
  let atuais: number[] = [];
  try {
    const resp = await xibo<Array<{ layouts?: Array<{ layoutId: number }> }> | { layouts?: Array<{ layoutId: number }> }>(
      `/api/campaign?campaignId=${campaignId}&embed=layouts`
    );
    const arr = Array.isArray(resp) ? resp : [resp];
    atuais = arr[0]?.layouts?.map(l => l.layoutId).filter(Boolean) ?? [];
  } catch (e) { console.warn("[reassign] não listou layouts atuais:", (e as Error).message); }

  // 2) Desanexa cada um
  for (const lid of atuais) {
    try {
      await xibo(`/api/campaign/layout/unassign/${campaignId}`, { method: "POST", body: new URLSearchParams({ layoutId: String(lid) }) });
    } catch (e) { console.warn(`[reassign] unassign ${lid} falhou:`, (e as Error).message); }
  }

  // 3) Anexa o novo (com daysOfWeek senão CampaignSchedulerTask pula)
  const body = new URLSearchParams();
  body.set("layoutId", String(novoLayoutId));
  body.set("displayOrder", "1");
  for (const d of [1, 2, 3, 4, 5, 6, 7]) body.append("daysOfWeek[]", String(d));
  if (dayPartId) body.set("dayPartId", String(dayPartId));
  await xibo(`/api/campaign/layout/assign/${campaignId}`, { method: "POST", body });
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
