/**
 * InfinityPay adapter — checkout por LINK da InfinitePay (CloudWalk).
 *
 * Portado do yugo-platform. A API é identificada APENAS pela `handle`
 * (InfiniteTag, sem o `$`) no corpo. Não há token/secret, e o webhook não
 * tem assinatura — por isso confirmamos SEMPRE via /payment_check antes de
 * liberar a campanha.
 *
 * Endpoints (base https://api.checkout.infinitepay.io):
 *   POST /links          → cria o link de pagamento (Pix / cartão até 12x)
 *   POST /payment_check  → consulta o status { paid, paid_amount, ... }
 *
 * Doc: https://www.infinitepay.io/checkout-documentacao
 */

const HANDLE = process.env.INFINITY_PAY_HANDLE || "";       // ex: "threedigital"
const BASE   = "https://api.checkout.infinitepay.io";

if (!HANDLE && typeof window === "undefined") {
  console.warn("[infinity-pay] INFINITY_PAY_HANDLE não configurado");
}

interface IpResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
  error?: string;
}

export interface IpItem {
  quantity: number;
  /** Preço unitário em CENTAVOS (R$ 10,00 = 1000). */
  price: number;
  description: string;
}

async function req<T = unknown>(path: string, payload: unknown): Promise<IpResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await res.json().catch(() => null)) as T;
    return {
      ok: res.ok,
      status: res.status,
      body,
      error: res.ok ? undefined : (body as { message?: string; error?: string } | null)?.message ?? (body as { message?: string; error?: string } | null)?.error ?? `Falha InfinityPay (${res.status})`,
    };
  } catch (e) {
    return { ok: false, status: 0, body: null as T, error: (e as Error).message };
  }
}

export interface CriarLinkOpts {
  items: IpItem[];
  orderNsu: string;
  redirectUrl?: string;
  webhookUrl?: string;
  customer?: { name?: string; email?: string; phone_number?: string };
}

/** Cria o link de checkout. Retorna URL + slug da fatura. */
export async function criarLinkInfinityPay(opts: CriarLinkOpts): Promise<IpResult<{ url?: string; slug?: string; invoice_slug?: string }>> {
  if (!HANDLE) return { ok: false, status: 0, body: {}, error: "INFINITY_PAY_HANDLE não configurado no .env" };
  const items = (opts.items ?? []).map(it => ({
    quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
    price: Math.max(1, Math.floor(Number(it.price) || 0)),
    description: (it.description || "Pagamento").toString().slice(0, 100).trim() || "Pagamento",
  }));
  const orderNsu = String(opts.orderNsu || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);

  const payload: Record<string, unknown> = {
    handle: HANDLE,
    items,
    order_nsu: orderNsu,
  };
  if (opts.redirectUrl) payload.redirect_url = opts.redirectUrl;
  if (opts.webhookUrl)  payload.webhook_url  = opts.webhookUrl;
  if (opts.customer && (opts.customer.name || opts.customer.email || opts.customer.phone_number)) {
    payload.customer = {
      ...(opts.customer.name ? { name: opts.customer.name.slice(0, 100) } : {}),
      ...(opts.customer.email ? { email: opts.customer.email.slice(0, 100) } : {}),
      ...(opts.customer.phone_number ? { phone_number: opts.customer.phone_number.replace(/\D/g, "").slice(0, 14) } : {}),
    };
  }
  return req("/links", payload);
}

/** Extrai a URL da resposta do /links (varia entre v1/v2). */
export function extrairUrlInfinityPay(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const direct =
    (obj.url as string) ?? (obj.link as string) ?? (obj.payment_url as string) ?? (obj.checkout_url as string) ??
    ((obj.data as Record<string, unknown> | undefined)?.url as string) ??
    ((obj.data as Record<string, unknown> | undefined)?.link as string) ??
    ((obj.data as Record<string, unknown> | undefined)?.checkout_url as string) ??
    ((obj.result as Record<string, unknown> | undefined)?.url as string) ??
    ((obj.result as Record<string, unknown> | undefined)?.link as string) ??
    null;
  if (typeof direct === "string" && /^https?:\/\//.test(direct)) return direct;

  // busca recursiva (até 3 níveis) por URL HTTPS da infinitepay
  const seen = new WeakSet<object>();
  const walk = (o: unknown, depth: number): string | null => {
    if (depth > 3 || !o || typeof o !== "object" || seen.has(o as object)) return null;
    seen.add(o as object);
    for (const v of Object.values(o as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\/(checkout\.infinitepay\.io|pag\.ae)\//.test(v)) return v;
      if (v && typeof v === "object") { const r = walk(v, depth + 1); if (r) return r; }
    }
    return null;
  };
  return walk(body, 0);
}

/** Consulta o status do pagamento (fonte de verdade — webhook nao tem assinatura). */
export async function consultarStatusInfinityPay(opts: { orderNsu: string; transactionNsu?: string | null; slug?: string | null }): Promise<IpResult<{ paid?: boolean; paid_amount?: number; capture_method?: string; receipt_url?: string; success?: boolean }>> {
  if (!HANDLE) return { ok: false, status: 0, body: {}, error: "INFINITY_PAY_HANDLE não configurado" };
  return req("/payment_check", {
    handle: HANDLE,
    order_nsu: opts.orderNsu,
    transaction_nsu: opts.transactionNsu ?? undefined,
    slug: opts.slug ?? undefined,
  });
}
