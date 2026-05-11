import { createHmac } from "crypto";
import {
  CobrarRequest, CobrarResponse, ConsultarResponse,
  EstornarRequest, EstornarResponse, GatewayConfig,
  IGateway, WebhookValidation,
} from "./types";

const STONE_API = {
  sandbox:    "https://sandbox-api.openbank.stone.com.br",
  producao:   "https://api.openbank.stone.com.br",
};

interface StoneTokenResponse {
  access_token: string;
  expires_in:   number;
  token_type:   string;
}

export class StoneGateway implements IGateway {
  readonly slug = "stone" as const;
  readonly nome = "Stone";

  private tokenCache?: { token: string; expiresAt: number };

  constructor(private readonly config: GatewayConfig) {}

  private get baseUrl(): string {
    return STONE_API[this.config.ambiente];
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }

    const response = await fetch(`${this.baseUrl}/auth/realms/stone_bank/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     this.config.client_id     || "",
        client_secret: this.config.client_secret || "",
      }),
    });

    if (!response.ok) {
      throw new Error(`Stone auth falhou: ${response.status}`);
    }

    const data: StoneTokenResponse = await response.json();

    this.tokenCache = {
      token:     data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        "X-Stone-Idempotency-Key": crypto.randomUUID(),
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stone API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async cobrar(req: CobrarRequest): Promise<CobrarResponse> {
    if (req.metodo === "pix") {
      return this.cobrarPix(req);
    }
    if (req.metodo === "link") {
      return this.criarLink(req);
    }
    throw new Error(`Stone: método '${req.metodo}' requer terminal físico (TEF)`);
  }

  private async cobrarPix(req: CobrarRequest): Promise<CobrarResponse> {
    const body = {
      amount:      Math.round(req.valor * 100),
      expiration:  3600,
      customer_id: req.cliente_cpf,
    };

    const data = await this.request<{
      id: string;
      brcode: string;
      amount: number;
    }>("/api/v1/pix/payment-links", { method: "POST", body: JSON.stringify(body) });

    return {
      gateway_id:     data.id,
      status:         "aguardando",
      valor:          data.amount / 100,
      metodo:         "pix",
      pix_copia_cola: data.brcode,
      gateway_data:   data,
    };
  }

  private async criarLink(req: CobrarRequest): Promise<CobrarResponse> {
    const body = {
      amount:      Math.round(req.valor * 100),
      description: req.descricao || "Pedido",
      expires_at:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const data = await this.request<{ id: string; payment_link: string }>(
      "/api/v1/payment-links",
      { method: "POST", body: JSON.stringify(body) }
    );

    return {
      gateway_id:     data.id,
      status:         "aguardando",
      valor:          req.valor,
      metodo:         "link",
      link_pagamento: data.payment_link,
      gateway_data:   data,
    };
  }

  async consultar(gatewayId: string): Promise<ConsultarResponse> {
    const data = await this.request<{ id: string; status: string; amount: number }>(
      `/api/v1/pix/payment-links/${gatewayId}`
    );

    const statusMap: Record<string, string> = {
      CREATED:  "aguardando",
      PAID:     "aprovado",
      EXPIRED:  "cancelado",
      CANCELED: "cancelado",
    };

    return {
      gateway_id:   data.id,
      status:       (statusMap[data.status] || "processando") as CobrarResponse["status"],
      valor:        data.amount / 100,
      gateway_data: data,
    };
  }

  async estornar(req: EstornarRequest): Promise<EstornarResponse> {
    const body = req.valor
      ? { amount: Math.round(req.valor * 100) }
      : {};

    const data = await this.request<{ id: string; status: string }>(
      `/api/v1/transactions/${req.gateway_id}/refund`,
      { method: "POST", body: JSON.stringify(body) }
    );

    return {
      success:      true,
      gateway_id:   data.id,
      status:       "estornado",
      gateway_data: data,
    };
  }

  async validarWebhook(payload: unknown, signature: string): Promise<WebhookValidation> {
    const secret = this.config.webhook_secret;

    if (!secret) {
      return { valid: true, payload: payload as Record<string, unknown> };
    }

    const body     = JSON.stringify(payload);
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const valid    = `sha256=${expected}` === signature;

    return { valid, payload: valid ? (payload as Record<string, unknown>) : {} };
  }
}
