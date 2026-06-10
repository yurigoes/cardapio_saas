/**
 * WhatsApp — envio de notificacoes agnostico de provider.
 *
 * Provider configurado via env WHATSAPP_PROVIDER:
 *   - 'evolution' (default no Brasil) — Evolution API self-hosted (gratis)
 *       Envs: EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_TOKEN
 *   - 'twilio' — Twilio Business API (pago, robusto)
 *       Envs: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (ex: 'whatsapp:+14155238886')
 *   - 'wppconnect' — WPP Connect (open-source alternativo)
 *       Envs: WPP_CONNECT_URL, WPP_CONNECT_SESSION, WPP_CONNECT_TOKEN
 *   - 'log' (fallback) — so loga no console (pra dev/teste)
 *
 * Uso:
 *   await enviarWhatsApp({ conta_id, destino: '5571999...', tipo: 'campanha_no_ar', mensagem: '...' });
 *
 * Sempre registra em midia_whatsapp_logs (pra auditoria + reprocessar falhas).
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

const PROVIDER = (process.env.WHATSAPP_PROVIDER ?? "log").toLowerCase();

/** Normaliza numero: tira espacos/parenteses/hifens, garante DDI 55 se vier sem. */
export function normalizarNumero(n: string): string {
  const s = (n ?? "").replace(/\D/g, "");
  if (!s) return "";
  // Numero brasileiro sem DDI -> adiciona 55
  if (s.length === 10 || s.length === 11) return "55" + s;
  return s;
}

async function enviarEvolution(destino: string, mensagem: string): Promise<{ ok: boolean; providerId?: string; erro?: string }> {
  const url = (process.env.EVOLUTION_URL ?? "").replace(/\/+$/, "");
  const instance = process.env.EVOLUTION_INSTANCE ?? "";
  const token = process.env.EVOLUTION_TOKEN ?? "";
  if (!url || !instance || !token) return { ok: false, erro: "EVOLUTION_URL/EVOLUTION_INSTANCE/EVOLUTION_TOKEN nao configurados" };
  try {
    const r = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify({ number: destino, text: mensagem }),
    });
    const data = await r.json().catch(() => ({})) as { key?: { id?: string }; message?: string; error?: string };
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status} ${data.error ?? data.message ?? ""}` };
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
