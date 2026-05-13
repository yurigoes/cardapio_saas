/**
 * Integração Mercado Pago — Checkout Pro.
 *
 * Pra usar:
 *   1. Criar conta em https://www.mercadopago.com.br/developers
 *   2. Copiar Access Token (test ou production) → MERCADOPAGO_ACCESS_TOKEN no .env
 *   3. Configurar webhook em https://www.mercadopago.com.br/developers/panel/notifications/webhooks
 *      URL: https://app.tthreedigital.com.br/api/webhooks/mercadopago
 *      Eventos: 'payment'
 *
 * Sem SDK — usa fetch direto pra não trazer dep pesada.
 */

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
  payer:        PreferencePayer;
  external_reference: string;   // ID da nossa compra/empresa
  notification_url:   string;   // webhook
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: "approved" | "all";
}

interface PreferenceResponse {
  id:           string;
  init_point:   string;       // URL pra redirecionar usuário (production)
  sandbox_init_point: string; // URL pra redirecionar (test)
  date_created: string;
}

function getToken(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurada");
  return t;
}

export function isSandbox(): boolean {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
  return t.startsWith("TEST-");
}

/**
 * Cria preferência de pagamento. Retorna URL pra redirecionar.
 */
export async function criarPreferencia(params: CreatePreferenceParams): Promise<PreferenceResponse> {
  const r = await fetch(`${API_BASE}/checkout/preferences`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${getToken()}`,
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
  status:                string;        // approved | pending | rejected | cancelled | refunded | charged_back
  status_detail:         string;
  external_reference:    string;
  transaction_amount:    number;
  date_approved:         string | null;
  payer?: {
    email?: string;
    first_name?: string;
  };
}

/**
 * Busca detalhes de um pagamento (chamado pelo webhook).
 */
export async function buscarPagamento(paymentId: string | number): Promise<PaymentInfo> {
  const r = await fetch(`${API_BASE}/v1/payments/${paymentId}`, {
    headers: { "Authorization": `Bearer ${getToken()}` },
  });
  if (!r.ok) throw new Error(`MP get payment: HTTP ${r.status}`);
  return r.json();
}
