/**
 * Helper Mercado Pago — assinatura recorrente (PreApproval).
 *
 * Env: MP_ACCESS_TOKEN    (access token da sua conta MP)
 *      MP_WEBHOOK_SECRET  (chave secreta do webhook, p/ validar a assinatura)
 *      APP_URL            (base pública da landing, ex https://midiaindoor.tthreedigital.com.br)
 */
import crypto from "crypto";

const MP_TOKEN  = process.env.MP_ACCESS_TOKEN ?? "";
const MP_SECRET = process.env.MP_WEBHOOK_SECRET ?? "";
const APP_URL   = (process.env.APP_URL ?? "https://midiaindoor.tthreedigital.com.br").replace(/\/+$/, "");
const MP_API    = "https://api.mercadopago.com";

/**
 * Valida a assinatura HMAC do webhook do Mercado Pago.
 *
 * O MP manda o header `x-signature` no formato: "ts=<unix>,v1=<hmac_sha256>".
 * Manifesto assinado: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * (cada campo só entra se presente). HMAC-SHA256 com MP_WEBHOOK_SECRET.
 *
 * Sem MP_WEBHOOK_SECRET configurado → retorna true (validação desligada).
 */
export function validarAssinaturaWebhook(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  if (!MP_SECRET) return true;
  if (!opts.xSignature) return false;

  const parts = Object.fromEntries(
    opts.xSignature.split(",").map(kv => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  let manifest = "";
  if (opts.dataId)     manifest += `id:${opts.dataId.toLowerCase()};`;
  if (opts.xRequestId) manifest += `request-id:${opts.xRequestId};`;
  manifest += `ts:${ts};`;

  const hmac = crypto.createHmac("sha256", MP_SECRET).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}

interface PreApprovalResp {
  id: string;
  init_point: string;
  status: string;
}

/** Cria assinatura recorrente mensal. Retorna URL pro cliente pagar. */
export async function criarPreApproval(opts: {
  assinaturaId: string;
  email: string;
  valorMensal: number;
  descricao: string;
}): Promise<{ id: string; init_point: string }> {
  if (!MP_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado");

  const r = await fetch(`${MP_API}/preapproval`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_TOKEN}` },
    body: JSON.stringify({
      reason: opts.descricao,
      external_reference: opts.assinaturaId,
      payer_email: opts.email,
      back_url: `${APP_URL}/painel?pago=1`,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(opts.valorMensal.toFixed(2)),
        currency_id: "BRL",
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await r.json() as PreApprovalResp & { message?: string };
  if (!r.ok || !data.init_point) {
    throw new Error(`MP preapproval falhou: ${data.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  return { id: data.id, init_point: data.init_point };
}

/** Cria um pagamento ÚNICO (Checkout Pro / preference) — usado por campanha DOOH. */
export async function criarPagamentoUnico(opts: {
  referencia: string;       // external_reference (ex: pagamento_id ou campanha_id)
  titulo: string;
  valor: number;
  email?: string;
}): Promise<{ id: string; init_point: string }> {
  if (!MP_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado");

  const r = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_TOKEN}` },
    body: JSON.stringify({
      items: [{ title: opts.titulo, quantity: 1, unit_price: Number(opts.valor.toFixed(2)), currency_id: "BRL" }],
      external_reference: opts.referencia,
      payer: opts.email ? { email: opts.email } : undefined,
      back_urls: { success: `${APP_URL}/painel?pago=1`, pending: `${APP_URL}/painel`, failure: `${APP_URL}/painel` },
      auto_return: "approved",
      notification_url: `${APP_URL}/api/pagamento/webhook`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json() as { id?: string; init_point?: string; message?: string };
  if (!r.ok || !data.init_point || !data.id) {
    throw new Error(`MP preference falhou: ${data.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  return { id: data.id, init_point: data.init_point };
}

/**
 * Cria pagamento PIX DIRETO via MP (gera QR code + copia-cola inline).
 * Diferente do criarPagamentoUnico que abre uma página Checkout Pro, este
 * retorna o QR/payload pra mostrar dentro do nosso modal.
 *
 * Webhook chega em /api/pagamento/webhook quando o PIX for confirmado.
 */
export async function criarPixDireto(opts: {
  referencia: string;       // external_reference (ex: campanha_id)
  titulo: string;
  valor: number;
  email: string;            // obrigatório pro MP
  nomePagador?: string;
}): Promise<{ id: string; qr_code: string; qr_code_base64: string; ticket_url: string; expira_em: string }> {
  if (!MP_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado");

  const r = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_TOKEN}`,
      "X-Idempotency-Key": `${opts.referencia}-${Date.now()}`,
    },
    body: JSON.stringify({
      transaction_amount: Number(opts.valor.toFixed(2)),
      description: opts.titulo,
      payment_method_id: "pix",
      external_reference: opts.referencia,
      notification_url: `${APP_URL}/api/pagamento/webhook`,
      payer: {
        email: opts.email,
        first_name: opts.nomePagador?.split(" ")[0],
        last_name: opts.nomePagador?.split(" ").slice(1).join(" ") || "—",
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json() as {
    id?: string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
    date_of_expiration?: string;
    message?: string;
  };
  if (!r.ok || !data.id) {
    throw new Error(`MP PIX falhou: ${data.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  const qr = data.point_of_interaction?.transaction_data;
  if (!qr?.qr_code) throw new Error("MP PIX sem QR retornado");
  return {
    id: String(data.id),
    qr_code: qr.qr_code,                 // copia-e-cola
    qr_code_base64: qr.qr_code_base64 ?? "",
    ticket_url: qr.ticket_url ?? "",
    expira_em: data.date_of_expiration ?? "",
  };
}

/** Consulta um pagamento (payment) por id → status + external_reference. */
export async function consultarPagamento(paymentId: string): Promise<{ status: string; external_reference?: string }> {
  const r = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json() as { status: string; external_reference?: string };
  return data;
}

/** Consulta status de um preapproval (inclui init_point pra reaproveitar o link). */
export async function consultarPreApproval(id: string): Promise<{
  status: string; external_reference?: string; init_point?: string;
}> {
  const r = await fetch(`${MP_API}/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json() as { status: string; external_reference?: string; init_point?: string };
  return data;
}
