// ─────────────────────────────────────────────
// Tipos base da arquitetura de gateways de pagamento
// ─────────────────────────────────────────────

export type GatewaySlug =
  | "stone" | "cielo" | "rede" | "getnet" | "pagseguro" | "mercadopago"
  | "pagarme" | "asaas" | "stripe" | "sumup" | "safrapay" | "infinitepay"
  | "bin" | "sicredi" | "sicoob" | "pix_bancario" | "tef" | "interno";

export type MetodoPagamento =
  | "dinheiro" | "credito" | "debito" | "pix" | "voucher"
  | "nfc" | "qrcode" | "link" | "boleto" | "transferencia";

export type StatusPagamento =
  | "pendente" | "processando" | "aprovado" | "recusado"
  | "cancelado" | "estornado" | "aguardando";

export interface GatewayConfig {
  nome:           string;
  slug:           GatewaySlug;
  client_id?:     string;
  client_secret?: string;
  api_key?:       string;
  merchant_id?:   string;
  terminal_id?:   string;
  token?:         string;
  webhook_url?:   string;
  webhook_secret?: string;
  ambiente:       "sandbox" | "producao";
  configuracoes:  Record<string, unknown>;
}

export interface CobrarRequest {
  valor:          number;
  metodo:         MetodoPagamento;
  parcelas?:      number;
  descricao?:     string;
  pedido_id?:     string;
  cliente_nome?:  string;
  cliente_cpf?:   string;
  cliente_email?: string;
  callback_url?:  string;
  metadata?:      Record<string, unknown>;
}

export interface CobrarResponse {
  gateway_id:      string;
  status:          StatusPagamento;
  valor:           number;
  metodo:          MetodoPagamento;
  pix_copia_cola?: string;
  pix_qrcode_url?: string;
  link_pagamento?: string;
  comprovante?:    string;
  gateway_data:    Record<string, unknown>;
}

export interface EstornarRequest {
  gateway_id: string;
  valor?:     number;  // parcial
  motivo?:    string;
}

export interface EstornarResponse {
  success:     boolean;
  gateway_id:  string;
  status:      StatusPagamento;
  gateway_data: Record<string, unknown>;
}

export interface ConsultarResponse {
  gateway_id:   string;
  status:       StatusPagamento;
  valor:        number;
  gateway_data: Record<string, unknown>;
}

export interface WebhookValidation {
  valid:   boolean;
  payload: Record<string, unknown>;
}

// Interface base que todos os gateways devem implementar
export interface IGateway {
  slug:   GatewaySlug;
  nome:   string;

  cobrar(req: CobrarRequest): Promise<CobrarResponse>;
  consultar(gatewayId: string): Promise<ConsultarResponse>;
  estornar(req: EstornarRequest): Promise<EstornarResponse>;
  validarWebhook(payload: unknown, signature: string): Promise<WebhookValidation>;
}

export interface GatewayCapabilities {
  metodos:       MetodoPagamento[];
  parcelamento:  boolean;
  recorrencia:   boolean;
  split:         boolean;
  tef:           boolean;
  nfc:           boolean;
  pix:           boolean;
  link_pagamento: boolean;
}
