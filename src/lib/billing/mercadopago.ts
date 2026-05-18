/**
 * Integração Mercado Pago — Checkout Pro + PreApproval (assinatura).
 *
 * Token vem de `saas_billing_config` (configurado pelo master em
 * /admin/billing). Fallback pra MERCADOPAGO_ACCESS_TOKEN do .env mantém
 * compat com módulos legados.
 *
 * Sem SDK — usa fetch direto.
 */
import { queryOne } from "@/lib/db/client";
import { decryptIfNeeded } from "@/lib/security/encrypt";

const API_BASE = "https://api.mercadopago.com";

interface PreferenceItem {
  id?:           string;
  title:         string;
  description?:  string;
  quantity:      number;
  unit_price:    number;
  currency_id?:  "BRL";
}

interface PreferencePayer { email: string; name?: string }

interface CreatePreferenceParams {
  items:        PreferenceItem[];
  payer?:       PreferencePayer;
  external_reference: string;
  notification_url:   string;
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: "approved" | "all";
  statement_descriptor?: string;
  payment_methods?: {
    installments?: number;
    excluded_payment_methods?: { id: string }[];
    excluded_payment_types?:   { id: string }[];
  };
}

interface PreferenceResponse {
  id:           string;
  init_point:   string;
  sandbox_init_point: string;
  date_created: string;
}

interface BillingConfigDb {
  mp_access_token:   string | null;
  mp_public_key:     string | null;
  mp_webhook_secret: string | null;
  ativo:             boolean;
  modo:              string;
}

let cached: { token: string; modo: string; ts: number } | null = null;
const CACHE_MS = 60_000;

/** Busca token MP do saas_billing_config (singleton). Cache 60s. */
async function getTokenInfo(): Promise<{ token: string; modo: "sandbox" | "producao" }> {
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return { token: cached.token, modo: cached.modo as "sandbox" | "producao" };
  }

  const cfg = await queryOne<BillingConfigDb>(
    `SELECT mp_access_token, mp_public_key, mp_webhook_secret, ativo, modo
       FROM saas_billing_config WHERE id = 1`
  ).catch(() => null);

  let token: string | null = null;
  if (cfg && cfg.ativo && cfg.mp_access_token) {
    token = decryptIfNeeded(cfg.mp_access_token) ?? cfg.mp_access_token;
  }
  // Fallback pro env (compat módulos legados antes da feature DB)
  if (!token) token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? null;
  if (!token) throw new Error("Mercado Pago não configurado (master /admin/billing ou MERCADOPAGO_ACCESS_TOKEN no .env)");

  const modo = (cfg?.modo === "producao" ? "producao" : "sandbox") as "sandbox" | "producao";
  cached = { token, modo, ts: Date.now() };
  return { token, modo };
}

export function invalidarCacheMp() {
  cached = null;
}

export async function isSandbox(): Promise<boolean> {
  const { token, modo } = await getTokenInfo();
  return modo === "sandbox" || token.startsWith("TEST-");
}

/** Webhook secret pra HMAC validation */
export async function getWebhookSecret(): Promise<string | null> {
  const cfg = await queryOne<{ mp_webhook_secret: string | null }>(
    `SELECT mp_webhook_secret FROM saas_billing_config WHERE id = 1`
  ).catch(() => null);
  if (cfg?.mp_webhook_secret) {
    return decryptIfNeeded(cfg.mp_webhook_secret) ?? cfg.mp_webhook_secret;
  }
  return process.env.MERCADOPAGO_WEBHOOK_SECRET ?? null;
}

/** Cria preferência de pagamento Checkout Pro. */
export async function criarPreferencia(params: CreatePreferenceParams): Promise<PreferenceResponse> {
  const { token } = await getTokenInfo();
  const r = await fetch(`${API_BASE}/checkout/preferences`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`MP create preference: HTTP ${r.status} — ${txt.slice(0, 300)}`);
  }
  return r.json();
}

interface PaymentInfo {
  id:                    number;
  status:                string;
  status_detail:         string;
  external_reference:    string;
  transaction_amount:    number;
  date_approved:         string | null;
  payer?: { email?: string; first_name?: string };
}

export async function buscarPagamento(paymentId: string | number): Promise<PaymentInfo> {
  const { token } = await getTokenInfo();
  const r = await fetch(`${API_BASE}/v1/payments/${paymentId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`MP get payment: HTTP ${r.status}`);
  return r.json();
}

// ─── PreApproval (assinatura recorrente) ─────────────────────────────────────

export interface PreApprovalCreateParams {
  reason:              string;          // descrição visível pro cliente
  external_reference:  string;          // ID nossa assinatura
  payer_email:         string;
  back_url:            string;          // pra onde voltar após cadastrar cartão
  notification_url:    string;
  auto_recurring: {
    frequency:         number;          // 1
    frequency_type:    "months" | "days";
    transaction_amount: number;
    currency_id:       "BRL";
    start_date?:       string;          // ISO 8601
    end_date?:         string;
  };
  status?:             "pending" | "authorized";
}

export interface PreApprovalResponse {
  id:                  string;
  init_point:          string;          // URL pro cliente cadastrar cartão
  status:              string;
  external_reference:  string;
  date_created:        string;
}

/**
 * Cria assinatura recorrente PreApproval.
 * Cliente é redirecionado pra `init_point`, cadastra cartão, MP autoriza
 * e começa a cobrar mensalmente.
 */
export async function criarPreApproval(params: PreApprovalCreateParams): Promise<PreApprovalResponse> {
  const { token } = await getTokenInfo();
  const r = await fetch(`${API_BASE}/preapproval`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "pending", ...params }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`MP create preapproval: HTTP ${r.status} — ${txt.slice(0, 300)}`);
  }
  return r.json();
}

export interface PreApprovalInfo {
  id:                  string;
  status:              string;          // pending | authorized | paused | cancelled
  external_reference:  string;
  payer_email:         string;
  next_payment_date:   string | null;
  last_modified:       string;
}

export async function buscarPreApproval(preapprovalId: string): Promise<PreApprovalInfo> {
  const { token } = await getTokenInfo();
  const r = await fetch(`${API_BASE}/preapproval/${preapprovalId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`MP get preapproval: HTTP ${r.status}`);
  return r.json();
}

export async function cancelarPreApproval(preapprovalId: string): Promise<void> {
  const { token } = await getTokenInfo();
  const r = await fetch(`${API_BASE}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!r.ok) throw new Error(`MP cancel preapproval: HTTP ${r.status}`);
}
