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
  const r = await fetch(`${XIBO_URL}${path}`, {
    method:  opts.method ?? "GET",
    headers,
    body:    opts.body,
    signal:  AbortSignal.timeout(30000),
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
