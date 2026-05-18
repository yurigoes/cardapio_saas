/**
 * Tipos compartilhados por todos os drivers de terminal de pagamento.
 *
 * Cada banco/gateway implementa um Driver que recebe IniciarPagamento e
 * devolve um IniciarResult com instruções pra UI (Intent Android, QR Code,
 * checkout URL, etc) + um gateway_tx_id pra polling.
 */

export type MetodoPagamento = "credito" | "debito" | "voucher" | "pix" | "qrcode";

export interface IniciarPagamentoInput {
  empresa_id:    string;
  terminal_id:   string;
  pedido_id?:    string;
  valor:         number;     // BRL
  metodo:        MetodoPagamento;
  parcelas?:     number;     // crédito
  origem:        "pdv" | "totem" | "api";
  retorno_url?:  string;     // pra drivers de checkout (Cielo API ecommerce)
  iniciado_por?: string;     // user UUID
}

export interface IniciarPagamentoResult {
  /** ID interno (terminal_transacoes.id) — UI polla por status com isso */
  transacao_id:  string;
  /** ID no gateway/banco */
  gateway_tx_id?: string;
  /** Modo de continuação do pagamento — UI usa pra decidir como prosseguir */
  modo: "intent_android" | "qr_code" | "checkout_url" | "polling_local" | "imediato";
  /** Intent Android pra disparar app TEF (Cliente Cielo, SiTef, Pay&Go, AutoPay) */
  intent_uri?:   string;
  /** QR Code copia-cola (PIX) */
  qr_code?:      string;
  /** Imagem do QR (base64/URL) */
  qr_code_img?:  string;
  /** URL de checkout (Cielo eCommerce) */
  checkout_url?: string;
  /** Status inicial */
  status: "pendente" | "processando" | "aprovada" | "recusada" | "erro";
  /** Mensagem amigável pra UI */
  mensagem?:     string;
}

export interface StatusPagamento {
  transacao_id: string;
  status:       "pendente" | "processando" | "aprovada" | "recusada" | "cancelada" | "expirada" | "erro";
  gateway_tx_id?:    string;
  authorization_id?: string;
  bandeira?:    string;
  ultimos_4?:   string;
  mensagem?:    string;
  pago_em?:     string;
}

export interface ConfirmacaoIntent {
  /** Resultado retornado pelo app TEF Android via Intent (callback) */
  transacao_id: string;
  resultado: "aprovada" | "recusada" | "cancelada" | "erro";
  authorization_id?: string;
  nsu?:              string;
  bandeira?:         string;
  ultimos_4?:        string;
  mensagem?:         string;
  raw?:              Record<string, unknown>;
}

export interface CredenciaisCielo {
  merchant_id:     string;
  merchant_key:    string;
  ambiente?:       "producao" | "sandbox";
  // TEF Intent: package name do app que recebe a Intent
  intent_package?: string;  // ex: "cielo.smart.client" ou "br.com.softwareexpress.sitefweb"
}

export interface BaseDriver {
  nome: string;       // "Cielo API", "Cielo TEF Android", etc
  iniciar(input: IniciarPagamentoInput, credenciais: Record<string, unknown>): Promise<IniciarPagamentoResult>;
  consultarStatus(transacaoId: string, gatewayTxId: string | null, credenciais: Record<string, unknown>): Promise<StatusPagamento>;
  cancelar?(transacaoId: string, gatewayTxId: string | null, credenciais: Record<string, unknown>): Promise<{ ok: boolean; mensagem?: string }>;
}
