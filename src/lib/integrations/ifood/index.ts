import { createHmac } from "crypto";
import { query, queryOne } from "@/lib/db/client";
import { logger } from "@/lib/utils/logger";

// ─────────────────────────────────────────────
// iFood Integration — Pedidos, Status, Cardápio
// ─────────────────────────────────────────────

const IFOOD_BASE = "https://merchant-api.ifood.com.br";

interface IfoodToken {
  access_token:  string;
  token_type:    string;
  expires_in:    number;
  merchant_id:   string;
}

interface IfoodCredentials {
  client_id:     string;
  client_secret: string;
  merchant_id:   string;
  webhook_secret?: string;
}

export class IfoodService {
  private tokenCache?: { token: string; expiresAt: number };

  constructor(private readonly creds: IfoodCredentials) {}

  // ─────────────────────────────────────────────
  // Autenticação
  // ─────────────────────────────────────────────
  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }

    const response = await fetch(`${IFOOD_BASE}/authentication/v1.0/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grantType:    "client_credentials",
        clientId:     this.creds.client_id,
        clientSecret: this.creds.client_secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`iFood auth falhou: ${response.status}`);
    }

    const data: IfoodToken = await response.json();

    this.tokenCache = {
      token:     data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return data.access_token;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(`${IFOOD_BASE}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`iFood API ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // ─────────────────────────────────────────────
  // Pedidos
  // ─────────────────────────────────────────────
  async buscarPedidosPendentes(): Promise<IfoodPedido[]> {
    const data = await this.request<{ orders: IfoodPedido[] }>(
      `/order/v1.0/events:polling`
    );
    return data.orders || [];
  }

  async confirmarPedido(orderId: string): Promise<void> {
    await this.request(`/order/v1.0/orders/${orderId}/statuses/confirmation`, {
      method: "POST",
    });
  }

  async iniciarPreparoPedido(orderId: string): Promise<void> {
    await this.request(`/order/v1.0/orders/${orderId}/statuses/preparation`, {
      method: "POST",
    });
  }

  async marcarPedidoPronto(orderId: string): Promise<void> {
    await this.request(`/order/v1.0/orders/${orderId}/statuses/ready-to-pickup`, {
      method: "POST",
    });
  }

  async despacharPedido(orderId: string): Promise<void> {
    await this.request(`/order/v1.0/orders/${orderId}/statuses/dispatch`, {
      method: "POST",
    });
  }

  async cancelarPedido(orderId: string, reason: string, cancelCode: string = "501"): Promise<void> {
    await this.request(`/order/v1.0/orders/${orderId}/statuses/cancellation`, {
      method: "POST",
      body:   JSON.stringify({ reason, cancelCode }),
    });
  }

  async buscarDetalhesPedido(orderId: string): Promise<IfoodPedido> {
    return this.request<IfoodPedido>(`/order/v1.0/orders/${orderId}`);
  }

  // ─────────────────────────────────────────────
  // Cardápio
  // ─────────────────────────────────────────────
  async buscarCardapio(): Promise<unknown> {
    return this.request(`/catalog/v2.0/merchants/${this.creds.merchant_id}/catalogs`);
  }

  async atualizarDisponibilidadeProduto(
    catalogId: string,
    productId: string,
    available: boolean
  ): Promise<void> {
    await this.request(
      `/catalog/v2.0/merchants/${this.creds.merchant_id}/catalogs/${catalogId}/items/${productId}`,
      {
        method: "PUT",
        body:   JSON.stringify({ status: available ? "AVAILABLE" : "UNAVAILABLE" }),
      }
    );
  }

  // ─────────────────────────────────────────────
  // Validação de Webhook
  // ─────────────────────────────────────────────
  validarWebhook(payload: string, signature: string): boolean {
    if (!this.creds.webhook_secret) return true;

    const expected = createHmac("sha256", this.creds.webhook_secret)
      .update(payload)
      .digest("base64");

    return expected === signature;
  }
}

// ─────────────────────────────────────────────
// Tipos do iFood
// ─────────────────────────────────────────────
export interface IfoodPedido {
  id:             string;
  reference:      string;
  displayId:      string;
  createdAt:      string;
  type:           string;
  orderTiming:    string;
  orderType:      string;
  merchant:       { id: string; name: string };
  customer:       { name: string; phone: string; taxpayerIdNumber?: string };
  items:          IfoodItem[];
  subTotal:       number;
  totalPrice:     number;
  deliveryFee:    number;
  benefits:       unknown[];
  payments:       { methods: IfoodPaymentMethod[] };
  delivery?:      { deliveryAddress: IfoodAddress };
  schedule?:      { scheduledDateTimeStart: string };
}

export interface IfoodItem {
  id:           string;
  index:        number;
  name:         string;
  externalCode: string;
  quantity:     number;
  price:        number;
  subItemPrice: number;
  totalPrice:   number;
  unit:         string;
  options:      IfoodOption[];
}

export interface IfoodOption {
  index:        number;
  code:         string;
  name:         string;
  quantity:     number;
  price:        number;
  externalCode: string;
}

export interface IfoodPaymentMethod {
  value:  number;
  currency: string;
  method:   string;
  type:     string;
}

export interface IfoodAddress {
  streetName:  string;
  streetNumber: string;
  neighborhood: string;
  city:         string;
  state:        string;
  postalCode:   string;
  reference?:   string;
  complement?:  string;
}

// ─────────────────────────────────────────────
// Converte pedido iFood para pedido interno
// ─────────────────────────────────────────────
export function converterPedidoIfood(ifoodPedido: IfoodPedido, empresaId: string) {
  const itens = ifoodPedido.items.map((item) => ({
    produto_id:     null,
    nome:           item.name,
    preco_unitario: item.price,
    quantidade:     item.quantity,
    subtotal:       item.totalPrice,
    observacoes:    null,
    adicionais:     item.options.map((o) => ({
      nome:  o.name,
      preco: o.price,
      qtd:   o.quantity,
    })),
    complementos:   [],
  }));

  return {
    empresa_id:       empresaId,
    tipo:             "ifood" as const,
    status:           "pendente" as const,
    origem:           "ifood",
    origem_id:        ifoodPedido.id,
    cliente_nome:     ifoodPedido.customer.name,
    cliente_telefone: ifoodPedido.customer.phone?.replace(/\D/g, ""),
    cliente_endereco: ifoodPedido.delivery?.deliveryAddress || null,
    subtotal:         ifoodPedido.subTotal,
    taxa_entrega:     ifoodPedido.deliveryFee,
    total:            ifoodPedido.totalPrice,
    itens,
    metadata: {
      ifood_display_id:   ifoodPedido.displayId,
      ifood_reference:    ifoodPedido.reference,
      ifood_order_timing: ifoodPedido.orderTiming,
    },
  };
}

// ─────────────────────────────────────────────
// Factory — cria serviço pelo empresa_id
// ─────────────────────────────────────────────
export async function getIfoodService(empresaId: string): Promise<IfoodService | null> {
  const integracao = await queryOne<{
    config: IfoodCredentials;
    ativo:  boolean;
  }>(
    `SELECT config, ativo FROM integracoes
     WHERE empresa_id = $1 AND tipo = 'ifood' AND ativo = TRUE`,
    [empresaId]
  );

  if (!integracao) return null;

  const { client_id, client_secret, merchant_id, webhook_secret } = integracao.config;

  if (!client_id || !client_secret || !merchant_id) {
    logger.warn("iFood: configuração incompleta", { empresaId });
    return null;
  }

  return new IfoodService({ client_id, client_secret, merchant_id, webhook_secret });
}
