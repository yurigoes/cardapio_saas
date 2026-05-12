/**
 * Asaas — Gateway PIX + Boleto + Cartão (API v3)
 *
 * Docs: https://docs.asaas.com/reference
 *
 * Auth: header access_token: $aas_xxx
 *
 * Fluxo PIX:
 *   1. Cria customer (ou reusa via externalReference) — POST /v3/customers
 *   2. Cria payment      → POST /v3/payments com billingType=PIX
 *   3. GET /v3/payments/{id}/pixQrCode → retorna QR code (encodedImage + payload)
 *   4. consultar()       → GET /v3/payments/{id}
 *
 * Webhook: POST com header asaas-access-token: <secret_configurado_no_asaas>
 *   Validação: comparação simples (timing-safe)
 */
import {
  CobrarRequest, CobrarResponse, ConsultarResponse,
  EstornarRequest, EstornarResponse, GatewayConfig,
  IGateway, StatusPagamento, WebhookValidation,
} from "./types";
import { timingSafeEqual } from "crypto";

interface AsaasCustomer {
  id:        string;
  name:      string;
  cpfCnpj?:  string;
  email?:    string;
}

interface AsaasPayment {
  id:                string;
  status:            string;       // PENDING | RECEIVED | CONFIRMED | OVERDUE | REFUNDED | CHARGEBACK_REQUESTED
  value:             number;
  billingType:       string;       // PIX | BOLETO | CREDIT_CARD
  invoiceUrl?:       string;
  bankSlipUrl?:      string;
  externalReference?: string;
}

interface AsaasPixQr {
  encodedImage: string;            // base64 da imagem PNG
  payload:      string;            // copia-e-cola
  expirationDate?: string;
}

function mapAsaasStatus(s: string): StatusPagamento {
  switch ((s || "").toUpperCase()) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":  return "aprovado";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS": return "aguardando";
    case "REFUNDED":
    case "REFUND_REQUESTED": return "estornado";
    case "OVERDUE":          return "recusado";
    case "DELETED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL": return "cancelado";
    default:                 return "pendente";
  }
}

export class AsaasGateway implements IGateway {
  readonly slug = "asaas" as const;
  readonly nome = "Asaas";

  private readonly accessToken: string;
  private readonly webhookSecret?: string;
  private readonly base: string;

  constructor(private readonly config: GatewayConfig) {
    this.accessToken = config.api_key ?? config.token ?? "";
    this.webhookSecret = config.webhook_secret;
    // Sandbox: https://sandbox.asaas.com/api/v3 — Produção: https://api.asaas.com/v3
    this.base = config.ambiente === "producao"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";
  }

  private headers() {
    return {
      "access_token": this.accessToken,
      "Content-Type": "application/json",
    };
  }

  // ── Garante um customer (cria se não existe) ──────────────────────────────

  private async getOrCreateCustomer(req: CobrarRequest): Promise<string> {
    // Se temos cliente_email, podemos buscar primeiro (idempotência)
    const refExterno = req.pedido_id ?? req.cliente_cpf ?? req.cliente_email ?? "";

    if (refExterno) {
      const search = await fetch(
        `${this.base}/customers?externalReference=${encodeURIComponent(refExterno)}`,
        { headers: this.headers() }
      );
      if (search.ok) {
        const data = await search.json() as { data: AsaasCustomer[] };
        if (data.data?.[0]?.id) return data.data[0].id;
      }
    }

    // Cria novo
    const body: Record<string, unknown> = {
      name:  req.cliente_nome ?? "Cliente",
      email: req.cliente_email,
    };
    if (req.cliente_cpf) body.cpfCnpj = req.cliente_cpf.replace(/\D/g, "");
    if (refExterno)      body.externalReference = refExterno;

    const res = await fetch(`${this.base}/customers`, {
      method: "POST",
      headers: this.headers(),
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Asaas customer: ${res.status} — ${err.slice(0, 200)}`);
    }
    const data = await res.json() as AsaasCustomer;
    return data.id;
  }

  // ── Cobrar ────────────────────────────────────────────────────────────────

  async cobrar(req: CobrarRequest): Promise<CobrarResponse> {
    if (!this.accessToken) throw new Error("Asaas: access_token não configurado");

    const customerId = await this.getOrCreateCustomer(req);

    // Mapeia método interno → billingType Asaas
    const billingType = (() => {
      switch (req.metodo) {
        case "pix":     return "PIX";
        case "boleto":  return "BOLETO";
        case "credito": return "CREDIT_CARD";
        case "debito":  return "DEBIT_CARD";
        default:        throw new Error(`Asaas não suporta método: ${req.metodo}`);
      }
    })();

    // Vencimento: hoje + 1 dia (PIX expira em 30min, mas API exige dueDate)
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const payBody: Record<string, unknown> = {
      customer:           customerId,
      billingType,
      value:              req.valor,
      dueDate,
      description:        req.descricao ?? "Pedido",
      externalReference:  req.pedido_id ?? undefined,
    };

    if (req.metodo === "credito" && req.metadata?.card_token) {
      payBody.creditCard = { holderName: req.cliente_nome, ccv: undefined };
      payBody.creditCardToken = req.metadata.card_token;
      payBody.installmentCount = req.parcelas ?? 1;
    }

    const res = await fetch(`${this.base}/payments`, {
      method:  "POST",
      headers: this.headers(),
      body:    JSON.stringify(payBody),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Asaas/cobrar] erro:", res.status, err);
      throw new Error(`Asaas retornou ${res.status}: ${err.slice(0, 300)}`);
    }

    const payment = await res.json() as AsaasPayment;

    // Para PIX, busca o QR code numa segunda chamada
    let pixCopiaCola: string | undefined;
    let pixQrcodeUrl: string | undefined;

    if (billingType === "PIX") {
      try {
        const qrRes = await fetch(`${this.base}/payments/${payment.id}/pixQrCode`, {
          headers: this.headers(),
        });
        if (qrRes.ok) {
          const qr = await qrRes.json() as AsaasPixQr;
          pixCopiaCola = qr.payload;
          pixQrcodeUrl = qr.encodedImage
            ? `data:image/png;base64,${qr.encodedImage}`
            : undefined;
        }
      } catch (e) {
        console.warn("[Asaas/cobrar] PIX QR falhou:", e);
      }
    }

    return {
      gateway_id:     payment.id,
      status:         mapAsaasStatus(payment.status),
      valor:          req.valor,
      metodo:         req.metodo,
      pix_copia_cola: pixCopiaCola,
      pix_qrcode_url: pixQrcodeUrl,
      link_pagamento: payment.invoiceUrl,
      gateway_data:   {
        billing_type:    payment.billingType,
        invoice_url:     payment.invoiceUrl,
        bank_slip_url:   payment.bankSlipUrl,
      },
    };
  }

  // ── Consultar ─────────────────────────────────────────────────────────────

  async consultar(gatewayId: string): Promise<ConsultarResponse> {
    const res = await fetch(`${this.base}/payments/${gatewayId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Asaas consulta: ${res.status}`);

    const data = await res.json() as AsaasPayment;
    return {
      gateway_id:   data.id,
      status:       mapAsaasStatus(data.status),
      valor:        data.value,
      gateway_data: {
        billing_type: data.billingType,
        status:       data.status,
        invoice_url:  data.invoiceUrl,
      },
    };
  }

  // ── Estornar ──────────────────────────────────────────────────────────────

  async estornar(req: EstornarRequest): Promise<EstornarResponse> {
    const body: Record<string, unknown> = {};
    if (req.valor != null) body.value = req.valor;
    if (req.motivo)        body.description = req.motivo;

    const res = await fetch(`${this.base}/payments/${req.gateway_id}/refund`, {
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
   * Asaas envia o webhook com header asaas-access-token contendo um valor
   * secreto que VOCÊ define ao configurar o webhook no painel.
   * Não é HMAC — é um token compartilhado (validar timing-safe).
   */
  async validarWebhook(
    payload: unknown,
    signature: string
  ): Promise<WebhookValidation> {
    if (!this.webhookSecret) {
      return { valid: true, payload: payload as Record<string, unknown> };
    }
    try {
      const a = Buffer.from(this.webhookSecret);
      const b = Buffer.from(signature || "");
      if (a.length !== b.length) {
        return { valid: false, payload: {} };
      }
      const valid = timingSafeEqual(a, b);
      return { valid, payload: valid ? (payload as Record<string, unknown>) : {} };
    } catch {
      return { valid: false, payload: {} };
    }
  }
}
