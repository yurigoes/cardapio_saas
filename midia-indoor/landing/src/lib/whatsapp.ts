/**
 * WhatsApp — envio de notificacoes agnostico de provider.
 *
 * Provider configurado via env WHATSAPP_PROVIDER (default 'evolution'):
 *   - 'evolution' (Brasil) — Evolution API self-hosted
 *       Envs: EVOLUTION_API_URL (interno docker), EVOLUTION_PUBLIC_URL (externo p/QR),
 *             EVOLUTION_API_KEY (master), EVOLUTION_INSTANCE (default 'three_digital')
 *       A instancia eh CRIADA AUTOMATICAMENTE na 1a tentativa de envio.
 *       Pra parear WhatsApp: GET /api/admin/whatsapp/setup → escaneia QR.
 *   - 'twilio' — Twilio Business API (pago, robusto)
 *       Envs: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   - 'wppconnect' — WPP Connect (open-source alternativo)
 *       Envs: WPP_CONNECT_URL, WPP_CONNECT_SESSION, WPP_CONNECT_TOKEN
 *   - 'log' (fallback) — so loga no console (dev/teste)
 *
 * Uso:
 *   await enviarWhatsApp({ conta_id, destino: '5571999...', tipo: 'campanha_no_ar', mensagem: '...' });
 *
 * Sempre registra em midia_whatsapp_logs (auditoria + reprocessar falhas).
 */
import { db } from "./db";

export type WhatsAppTipo =
  | "campanha_no_ar" | "arte_aprovada" | "arte_rejeitada"
  | "os_aberta" | "pagamento_ok" | "vencimento" | "manual";

interface EnviarOpts {
  destino: string;            // numero E.164 (ex: '5571999998888') ou ja com DDI
  mensagem: string;
  tipo: WhatsAppTipo;
  conta_id?: string;          // pra rastrear no log
  cabecalho?: string;         // titulo opcional (usado em providers que suportam)
}

// Default 'evolution' (Brasil). Pra dev/staging sem provider, use WHATSAPP_PROVIDER=log
const PROVIDER = (process.env.WHATSAPP_PROVIDER ?? "evolution").toLowerCase();
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "three_digital";

/** URL interna do Evolution (docker network). Fallback pra publica. */
function evolutionBaseUrl(): string {
  return ((process.env.EVOLUTION_API_URL ?? process.env.EVOLUTION_PUBLIC_URL ?? "").replace(/\/+$/, ""));
}

/** Garante que a instancia existe. Cria automaticamente se nao existir.
 *  Retorna { existia, criada, erro? }. Idempotente — chamadas seguintes sao no-op. */
let _instanciaPronta = false;
async function garantirInstanciaEvolution(): Promise<{ ok: boolean; criada?: boolean; erro?: string }> {
  if (_instanciaPronta) return { ok: true };
  const url = evolutionBaseUrl();
  const key = process.env.EVOLUTION_API_KEY ?? "";
  if (!url || !key) return { ok: false, erro: "EVOLUTION_API_URL/EVOLUTION_API_KEY nao configurados" };

  try {
    // Verifica se ja existe
    const r = await fetch(`${url}/instance/fetchInstances?instanceName=${EVOLUTION_INSTANCE}`, {
      headers: { apikey: key },
    });
    if (r.ok) {
      const data = await r.json().catch(() => null);
      const lista = Array.isArray(data) ? data : (data?.instance ? [data] : []);
      if (lista.length > 0) { _instanciaPronta = true; return { ok: true, criada: false }; }
    }
    // Nao existe — cria
    const create = await fetch(`${url}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        instanceName: EVOLUTION_INSTANCE,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!create.ok) {
      const txt = await create.text();
      return { ok: false, erro: `criar instancia falhou HTTP ${create.status}: ${txt.slice(0, 200)}` };
    }
    _instanciaPronta = true;
    return { ok: true, criada: true };
  } catch (e) { return { ok: false, erro: (e as Error).message }; }
}

/** Estado da instancia (open=conectado/QR pareado, close=desconectado, connecting=QR exibido). */
export async function obterEstadoEvolution(): Promise<{ ok: boolean; estado?: string; qrcode?: string; erro?: string }> {
  const url = evolutionBaseUrl();
  const key = process.env.EVOLUTION_API_KEY ?? "";
  if (!url || !key) return { ok: false, erro: "EVOLUTION_API_URL/EVOLUTION_API_KEY nao configurados" };
  await garantirInstanciaEvolution();
  try {
    const r = await fetch(`${url}/instance/connectionState/${EVOLUTION_INSTANCE}`, { headers: { apikey: key } });
    const data = await r.json().catch(() => null) as { instance?: { state?: string }; state?: string } | null;
    const estado = data?.instance?.state ?? data?.state ?? "unknown";

    let qrcode: string | undefined;
    if (estado !== "open") {
      // Pega QR code pra parear
      const q = await fetch(`${url}/instance/connect/${EVOLUTION_INSTANCE}`, { headers: { apikey: key } });
      const qd = await q.json().catch(() => null) as { base64?: string; qrcode?: { base64?: string }; code?: string } | null;
      qrcode = qd?.base64 ?? qd?.qrcode?.base64 ?? qd?.code;
    }
    return { ok: true, estado, qrcode };
  } catch (e) { return { ok: false, erro: (e as Error).message }; }
}

/** Desconecta a instancia (logout WhatsApp). Pra trocar de numero/aparelho. */
export async function logoutEvolution(): Promise<{ ok: boolean; erro?: string }> {
  const url = evolutionBaseUrl();
  const key = process.env.EVOLUTION_API_KEY ?? "";
  if (!url || !key) return { ok: false, erro: "nao configurado" };
  try {
    const r = await fetch(`${url}/instance/logout/${EVOLUTION_INSTANCE}`, { method: "DELETE", headers: { apikey: key } });
    return { ok: r.ok, erro: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) { return { ok: false, erro: (e as Error).message }; }
}

/** Normaliza numero: tira espacos/parenteses/hifens, garante DDI 55 se vier sem. */
export function normalizarNumero(n: string): string {
  const s = (n ?? "").replace(/\D/g, "");
  if (!s) return "";
  // Numero brasileiro sem DDI -> adiciona 55
  if (s.length === 10 || s.length === 11) return "55" + s;
  return s;
}

async function enviarEvolution(destino: string, mensagem: string): Promise<{ ok: boolean; providerId?: string; erro?: string }> {
  const url = evolutionBaseUrl();
  const key = process.env.EVOLUTION_API_KEY ?? "";
  if (!url || !key) return { ok: false, erro: "EVOLUTION_API_URL/EVOLUTION_API_KEY nao configurados" };

  // Garante que a instancia existe (auto-cria 1a vez)
  const inst = await garantirInstanciaEvolution();
  if (!inst.ok) return { ok: false, erro: `instancia nao pronta: ${inst.erro}` };
  if (inst.criada) console.log(`[whatsapp] instancia '${EVOLUTION_INSTANCE}' criada automaticamente — pareie via /api/admin/whatsapp/setup`);

  try {
    const r = await fetch(`${url}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: destino, text: mensagem }),
    });
    const data = await r.json().catch(() => ({})) as { key?: { id?: string }; message?: string; error?: string };
    if (!r.ok) {
      const errMsg = data.error ?? data.message ?? "";
      // Erro tipico quando WhatsApp nao pareou ainda
      if (/not.*connect|not.*open|qr|baileys/i.test(errMsg)) {
        return { ok: false, erro: `WhatsApp nao pareado — acesse /api/admin/whatsapp/setup pra escanear QR. (${errMsg})` };
      }
      return { ok: false, erro: `HTTP ${r.status} ${errMsg}` };
    }
    return { ok: true, providerId: data.key?.id };
  } catch (e) { return { ok: false, erro: (e as Error).message }; }
}

async function enviarTwilio(destino: string, mensagem: string): Promise<{ ok: boolean; providerId?: string; erro?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_WHATSAPP_FROM ?? "";
  if (!sid || !token || !from) return { ok: false, erro: "TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM nao configurados" };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ From: from, To: `whatsapp:+${destino}`, Body: mensagem });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await r.json().catch(() => ({})) as { sid?: string; message?: string };
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status} ${data.message ?? ""}` };
    return { ok: true, providerId: data.sid };
  } catch (e) { return { ok: false, erro: (e as Error).message }; }
}

async function enviarWppConnect(destino: string, mensagem: string): Promise<{ ok: boolean; providerId?: string; erro?: string }> {
  const url = (process.env.WPP_CONNECT_URL ?? "").replace(/\/+$/, "");
  const session = process.env.WPP_CONNECT_SESSION ?? "";
  const token = process.env.WPP_CONNECT_TOKEN ?? "";
  if (!url || !session || !token) return { ok: false, erro: "WPP_CONNECT_URL/SESSION/TOKEN nao configurados" };
  try {
    const r = await fetch(`${url}/api/${session}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: destino, message: mensagem, isGroup: false }),
    });
    const data = await r.json().catch(() => ({})) as { id?: string; response?: { id?: string }; message?: string };
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status} ${data.message ?? ""}` };
    return { ok: true, providerId: data.id ?? data.response?.id };
  } catch (e) { return { ok: false, erro: (e as Error).message }; }
}

/** Envia + sempre grava em midia_whatsapp_logs. Retorna {ok, erro?}. */
export async function enviarWhatsApp(opts: EnviarOpts): Promise<{ ok: boolean; erro?: string; providerId?: string }> {
  const destino = normalizarNumero(opts.destino);
  if (!destino || destino.length < 10) {
    return { ok: false, erro: "numero invalido" };
  }
  const msg = opts.cabecalho ? `*${opts.cabecalho}*\n\n${opts.mensagem}` : opts.mensagem;

  let resultado: { ok: boolean; providerId?: string; erro?: string };
  switch (PROVIDER) {
    case "evolution":  resultado = await enviarEvolution(destino, msg); break;
    case "twilio":     resultado = await enviarTwilio(destino, msg); break;
    case "wppconnect": resultado = await enviarWppConnect(destino, msg); break;
    case "log":
    default:
      console.log(`[whatsapp:log] -> ${destino} (${opts.tipo})\n${msg}\n---`);
      resultado = { ok: true, providerId: "log-only" };
  }

  // Log SEMPRE — facil reprocessar falhas e auditar
  try {
    await db().query(
      `INSERT INTO midia_whatsapp_logs (conta_id, destino, tipo, mensagem, status, provider, provider_id, erro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [opts.conta_id ?? null, destino, opts.tipo, msg, resultado.ok ? "enviado" : "falha", PROVIDER, resultado.providerId ?? null, resultado.erro ?? null]
    );
  } catch (e) { console.warn("[whatsapp] log falhou:", (e as Error).message); }

  return resultado;
}

/** Helper: envia pra um anunciante (busca numero + opt-in da conta). */
export async function enviarWhatsAppParaConta(opts: {
  contaId: string;
  tipo: WhatsAppTipo;
  cabecalho?: string;
  mensagem: string;
}): Promise<{ ok: boolean; erro?: string; pulado?: string }> {
  const c = await db().query<{ whatsapp: string | null; whatsapp_notif: string | null; whatsapp_optin: boolean; nome: string }>(
    `SELECT whatsapp, whatsapp_notif, whatsapp_optin, nome FROM midia_contas WHERE id = $1`, [opts.contaId]
  ).then(r => r.rows[0]);
  if (!c) return { ok: false, pulado: "conta nao encontrada" };
  if (!c.whatsapp_optin) return { ok: false, pulado: "anunciante optou por nao receber" };
  const numero = (c.whatsapp_notif || c.whatsapp || "").trim();
  if (!numero) return { ok: false, pulado: "sem numero cadastrado" };
  return enviarWhatsApp({ destino: numero, conta_id: opts.contaId, tipo: opts.tipo, cabecalho: opts.cabecalho, mensagem: opts.mensagem });
}

/** Pra master receber alertas operacionais (queima TV, OS critica, etc) */
export async function enviarWhatsAppMaster(opts: { tipo: WhatsAppTipo; cabecalho?: string; mensagem: string }): Promise<{ ok: boolean; erro?: string }> {
  const numero = process.env.MASTER_WHATSAPP ?? "";
  if (!numero) return { ok: false, erro: "MASTER_WHATSAPP nao configurado" };
  return enviarWhatsApp({ destino: numero, tipo: opts.tipo, cabecalho: opts.cabecalho, mensagem: opts.mensagem });
}
