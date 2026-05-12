/**
 * Mercado Pago — Gateway PIX
 *
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/payments
 *
 * Fluxo:
 *   1. cobrar()    → POST /v1/payments  (payment_method_id: "pix")
 *   2. consultar() → GET  /v1/payments/{id}
 *   3. estornar()  → POST /v1/payments/{id}/refunds
 *
 * Credenciais (gateway_config.token = ACCESS_TOKEN)
 */
import {
  CobrarRequest, CobrarResponse, ConsultarResponse,
  EstornarRequest, EstornarResponse, GatewayConfig,
  IGateway, StatusPagamento, WebhookValidation,
} from "./types";
import { createHmac } from "crypto";

const MP_API = "https://api.mercadopago.com";

interface MpPaymentResponse {
  id:                  number;
  status:              string;       // pending | approved | rejected | cancelled | refunded
  status_detail:       string;
  transaction_amount:  number;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?:        string;       // copia-e-cola
      qr_code_base64?: string;       // QR em base64
    };
  };
}

function mapMpStatus(status: string): StatusPagamento {
  switch (status) {
    case "approved":  return "aprovado";
    case "pending":   return "aguardando";
    case "in_process":return "processando";
    case "rejected":  return "recusado";
    case "cancelled": return "cancelado";
    case "refunded":  return "estornado";
    default:          return "pendente";
  }
}

export class MercadoPagoGateway implements IGateway {
  readonly slug = "mercadopago" as const;
  readonly nome = "Mercado Pago";

  private readonly accessToken: string;
  private readonly notificationUrl?: string;

  constructor(private readonly config: GatewayConfig) {
    // token = access_token do MP (começa com APP_USR- ou TEST-)
    this.accessToken    = config.token ?? config.api_key ?? "";
    this.notificationUrl = config.webhook_url;
  }

  private headers() {
    return {
      "Authorization":  `Bearer ${this.accessToken}`,
      "Content-Type":   "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    };
  }

  // ── Cobrar ────────────────────────────────────────────────────────────────

  async cobrar(req: CobrarRequest): Promise<CobrarResponse> {
    if (!this.accessToken) throw new Error("Mercado Pago: access_token não configurado");

    const body: Record<string, unknown> = {
      transaction_amount: req.valor,
      description:        req.descricao ?? "Pedido",
      payment_method_id:  "pix",
      payer: {
        email: req.cliente_email ?? "cliente@restaurante.com",
        ...(req.cliente_cpf
          ? { identification: { type: "CPF", number: req.cliente_cpf.replace(/\D/g, "") } }
          : {}),
        ...(req.cliente_nome ? { first_name: req.cliente_nome.split(" ")[0] } : {}),
      },
      external_reference:  req.pedido_id ?? undefined,
      date_of_expiration:  new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      ...(this.notificationUrl
        ? { notification_url: this.notificationUrl }
        : {}),
    };

    const res = await fetch(`${MP_API}/v1/payments`, {
      method:  "POST",
      headers: this.headers(),
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[MP/cobrar] erro:", err);
      throw new Error(`Mercado Pago retornou ${res.status}: ${err}`);
    }

    const data = await res.json() as MpPaymentResponse;

    const qrCopiaCola = data.point_of_interaction?.transaction_data?.qr_code;
    const qrBase64    = data.point_of_interaction?.transaction_data?.qr_code_base64;
    const qrUrl       = qrBase64
      ? `data:image/png;base64,${qrBase64}`
      : qrCopiaCola
        ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCopiaCola)}`
        : undefined;

    return {
      gateway_id:      String(data.id),
      status:          mapMpStatus(data.status),
      valor:           req.valor,
      metodo:          "pix",
      pix_copia_cola:  qrCopiaCola,
      pix_qrcode_url:  qrUrl,
      gateway_data:    {
        mp_id:          data.id,
        status:         data.status,
        status_detail:  data.status_detail,
      },
    };
  }

  // ── Consultar ─────────────────────────────────────────────────────────────

  async consultar(gatewayId: string): Promise<ConsultarResponse> {
    const res = await fetch(`${MP_API}/v1/payments/${gatewayId}`, {
      headers: this.headers(),
    });

    if (!res.ok) throw new Error(`Mercado Pago consulta: ${res.status}`);

    const data = await res.json() as MpPaymentResponse;

    return {
      gateway_id:   String(data.id),
      status:       mapMpStatus(data.status),
      valor:        data.transaction_amount,
      gateway_data: {
        status:        data.status,
        status_detail: data.status_detail,
      },
    };
  }

  // ── Estornar ──────────────────────────────────────────────────────────────

  async estornar(req: EstornarRequest): Promise<EstornarResponse> {
    const body = req.valor ? { amount: req.valor } : {};

    const res = await fetch(`${MP_API}/v1/payments/${req.gateway_id}/refunds`, {
      method:  "POST",
      headers: this.headers(),
      body:    JSON.stringify(body),
    });

    const ok = res.ok || res.status === 201;
    return {
      success:      ok,
      gateway_id:   req.gateway_id,
      status:       ok ? "estornado" : "recusado",
      gateway_data: ok ? {} : { error: await res.text() },
    };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async validarWebhook(
    payload: unknown,
    signature: string
  ): Promise<WebhookValidation> {
    // MP assina via x-signature header: ts=...,v1=...
    // Se não tiver webhook_secret configurado, aceita tudo
    if (!this.config.webhook_secret) {
      return { valid: true, payload: payload as Record<string, unknown> };
    }

    try {
      // Extrai ts e v1 do header "ts=...,v1=..."
      const parts  = signature.split(",");
      const ts     = parts.find(p => p.startsWith("ts="))?.slice(3) ?? "";
      const v1     = parts.find(p => p.startsWith("v1="))?.slice(3) ?? "";
      const body   = JSON.stringify(payload);
      const toSign = `id:${(payload as Record<string, unknown>)?.data?.id ?? ""};request-id:;ts:${ts};`;
      const expected = createHmac("sha256", this.config.webhook_secret)
        .update(toSign)
        .digest("hex");
      const valid = v1 === expected;
      return { valid, payload: payload as Record<string, unknown> };
    } catch {
      return { valid: false, payload: {} };
    }
  }
}
