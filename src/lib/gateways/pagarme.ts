/**
 * Pagar.me — Gateway PIX + Cartão (API v5)
 *
 * Docs: https://docs.pagar.me/reference/criar-pedido
 *
 * Auth: HTTP Basic com secret_key:"" (base64)
 *   Authorization: Basic base64(`${secret_key}:`)
 *
 * Fluxo PIX:
 *   1. cobrar()    → POST /core/v5/orders { payments: [{ payment_method: "pix", pix: {...} }] }
 *   2. Resposta inclui charges[0].last_transaction.qr_code e qr_code_url
 *   3. consultar() → GET /core/v5/orders/{id} (status: paid|failed|pending|canceled)
 *   4. estornar()  → POST /core/v5/charges/{charge_id}/refund
 *
 * Webhook: POST com header x-hub-signature: sha1=...
 *   Validação: HMAC-SHA1(body, webhook_secret) === sig.replace('sha1=', '')
 */
import {
  CobrarRequest, CobrarResponse, ConsultarResponse,
  EstornarRequest, EstornarResponse, GatewayConfig,
  IGateway, StatusPagamento, WebhookValidation,
} from "./types";
import { createHmac, timingSafeEqual } from "crypto";

const PM_API = "https://api.pagar.me/core/v5";

interface PmCharge {
  id:                 string;
  status:             string;
  amount:             number;
  payment_method:     string;
  last_transaction?: {
    qr_code?:        string;
    qr_code_url?:    string;
    expires_at?:     string;
    transaction_type?: string;
  };
}

interface PmOrder {
  id:       string;
  status:   string;     // pending | paid | canceled | failed
  amount:   number;
  charges:  PmCharge[];
  code:     string;
  customer: { id: string };
}

function mapPmStatus(status: string): StatusPagamento {
  switch ((status || "").toLowerCase()) {
    case "paid":      return "aprovado";
    case "pending":   return "aguardando";
    case "processing":return "processando";
    case "failed":    return "recusado";
    case "canceled":  return "cancelado";
    case "refunded":  return "estornado";
    default:          return "pendente";
  }
}

export class PagarmeGateway implements IGateway {
  readonly slug = "pagarme" as const;
  readonly nome = "Pagar.me";

  private readonly secretKey: string;
  private readonly webhookSecret?: string;

  constructor(private readonly config: GatewayConfig) {
    // Aceita api_key OU token como secret_key (sk_test_... ou sk_live_...)
    this.secretKey     = config.api_key ?? config.token ?? "";
    this.webhookSecret = config.webhook_secret;
  }

  private headers() {
    const auth = Buffer.from(`${this.secretKey}:`).toString("base64");
    return {
      "Authorization":      `Basic ${auth}`,
      "Content-Type":       "application/json",
      "Idempotency-Key":    crypto.randomUUID(),
    };
  }

  // ── Cobrar ────────────────────────────────────────────────────────────────

  async cobrar(req: CobrarRequest): Promise<CobrarResponse> {
    if (!this.secretKey) throw new Error("Pagar.me: secret_key não configurada");

    // Pagar.me trabalha em centavos (integer)
    const amountCents = Math.round(req.valor * 100);

    // Customer obrigatório
    const customer: Record<string, unknown> = {
      name:  req.cliente_nome ?? "Cliente",
      email: req.cliente_email ?? "cliente@restaurante.com",
      type:  "individual",
    };
    if (req.cliente_cpf) {
      customer.document      = req.cliente_cpf.replace(/\D/g, "");
      customer.document_type = "CPF";
    }

    // Item único do pedido (descrição)
    const items = [{
      amount:      amountCents,
      description: req.descricao ?? `Pedido ${req.pedido_id ?? ""}`,
      quantity:    1,
      code:        req.pedido_id ?? "PEDIDO",
    }];

    let payment: Record<string, unknown>;

    if (req.metodo === "pix") {
      payment = {
        payment_method: "pix",
        pix: {
          expires_in: 60 * 30, // 30min em segundos
          additional_information: req.descricao ? [
            { name: "Pedido", value: req.descricao.slice(0, 64) },
          ] : undefined,
        },
      };
    } else if (req.metodo === "credito" || req.metodo === "debito") {
      // Cartão exige tokenização no frontend (card_token).
      // Aqui esperamos req.metadata?.card_token vindo do checkout.
      const cardToken = (req.metadata?.card_token as string) ?? "";
      if (!cardToken) {
        throw new Error("Pagar.me cartão: card_token obrigatório (tokenize no frontend)");
      }
      payment = {
        payment_method: req.metodo === "credito" ? "credit_card" : "debit_card",
        [req.metodo === "credito" ? "credit_card" : "debit_card"]: {
          installments:     req.parcelas ?? 1,
          statement_descriptor: "PEDIDO",
          card_token:       cardToken,
          ...(req.metodo === "credito" && req.parcelas && req.parcelas > 1
            ? { operation_type: "auth_and_capture" }
            : {}),
        },
      };
    } else {
      throw new Error(`Pagar.me não suporta método: ${req.metodo}`);
    }

    const body = {
      code:      req.pedido_id ?? `pedido-${Date.now()}`,
      customer,
      items,
      payments:  [payment],
      metadata:  {
        pedido_id: req.pedido_id ?? "",
      },
    };

    const res = await fetch(`${PM_API}/orders`, {
      method:  "POST",
      headers: this.headers(),
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Pagarme/cobrar] erro:", res.status, err);
      throw new Error(`Pagar.me retornou ${res.status}: ${err.slice(0, 300)}`);
    }

    const order = await res.json() as PmOrder;
    const charge = order.charges?.[0];
    const tx     = charge?.last_transaction;

    return {
      gateway_id:      String(charge?.id ?? order.id),
      status:          mapPmStatus(order.status),
      valor:           req.valor,
      metodo:          req.metodo,
      pix_copia_cola:  tx?.qr_code,
      pix_qrcode_url:  tx?.qr_code_url,
      gateway_data:    {
        order_id:  order.id,
        charge_id: charge?.id,
        order_code: order.code,
        status:    order.status,
        expires_at: tx?.expires_at,
      },
    };
  }

  // ── Consultar ─────────────────────────────────────────────────────────────

  async consultar(gatewayId: string): Promise<ConsultarResponse> {
    // gatewayId pode ser charge_id (preferido) ou order_id (fallback)
    // Tenta primeiro como charge, depois como order
    let res = await fetch(`${PM_API}/charges/${gatewayId}`, { headers: this.headers() });

    if (res.status === 404) {
      res = await fetch(`${PM_API}/orders/${gatewayId}`, { headers: this.headers() });
    }

    if (!res.ok) {
      throw new Error(`Pagar.me consulta: ${res.status}`);
    }

    const data = await res.json() as PmCharge | PmOrder;
    const status = "status" in data ? data.status : "pending";
    const amount = "amount" in data ? data.amount : 0;

    return {
      gateway_id:   gatewayId,
      status:       mapPmStatus(status),
      valor:        amount / 100,
      gateway_data: { status, raw_amount: amount },
    };
  }

  // ── Estornar ──────────────────────────────────────────────────────────────

  async estornar(req: EstornarRequest): Promise<EstornarResponse> {
    const body: Record<string, unknown> = {};
    if (req.valor != null) body.amount = Math.round(req.valor * 100);

    const res = await fetch(`${PM_API}/charges/${req.gateway_id}/refund`, {
      method:  "POST",
      headers: this.headers(),
      body:    JSON.stringify(body),
    });

    const ok = res.ok;
    return {
      success:      ok,
      gateway_id:   req.gateway_id,
      status:       ok ? "estornado" : "recusado",
      gateway_data: ok ? {} : { error: await res.text() },
    };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  /**
   * Pagar.me assina o body com HMAC-SHA1 e envia em X-Hub-Signature: sha1=...
   * Comparação em tempo constante (timingSafeEqual) para evitar timing attacks.
   */
  async validarWebhook(
    payload: unknown,
    signature: string
  ): Promise<WebhookValidation> {
    if (!this.webhookSecret) {
      // Sem secret configurado: aceita mas marca como não-verificado
      return { valid: true, payload: payload as Record<string, unknown> };
    }

    try {
      const body     = JSON.stringify(payload);
      const sig      = signature.replace(/^sha1=/, "");
      const expected = createHmac("sha1", this.webhookSecret).update(body).digest("hex");

      // timingSafeEqual exige buffers do mesmo tamanho
      if (sig.length !== expected.length) {
        return { valid: false, payload: {} };
      }

      const valid = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
      return { valid, payload: valid ? (payload as Record<string, unknown>) : {} };
    } catch (e) {
      console.warn("[Pagarme/webhook] validação falhou:", e);
      return { valid: false, payload: {} };
    }
  }
}
