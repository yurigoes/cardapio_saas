/**
 * Driver: Cielo API REST (eCommerce / Cielo Pay)
 *
 * Pagamento ONLINE — sem terminal físico. Usado pra:
 *  - Totem sem pinpad (cliente paga digitando cartão num form ou via QR PIX)
 *  - Checkout web
 *
 * Docs: https://developercielo.github.io/manual/cielo-ecommerce
 *
 * Endpoints (homologação): https://apisandbox.cieloecommerce.cielo.com.br/
 *           (produção):    https://api.cieloecommerce.cielo.com.br/
 * Query:    https://apiquerysandbox.cieloecommerce.cielo.com.br/ (sandbox)
 *           https://apiquery.cieloecommerce.cielo.com.br/        (prod)
 */
import type {
  BaseDriver, IniciarPagamentoInput, IniciarPagamentoResult,
  StatusPagamento, CredenciaisCielo,
} from "./types";

function baseUrl(ambiente: string): string {
  return ambiente === "sandbox"
    ? "https://apisandbox.cieloecommerce.cielo.com.br"
    : "https://api.cieloecommerce.cielo.com.br";
}
function queryUrl(ambiente: string): string {
  return ambiente === "sandbox"
    ? "https://apiquerysandbox.cieloecommerce.cielo.com.br"
    : "https://apiquery.cieloecommerce.cielo.com.br";
}

function headers(c: CredenciaisCielo): HeadersInit {
  return {
    "Content-Type":    "application/json",
    "MerchantId":      c.merchant_id,
    "MerchantKey":     c.merchant_key,
    "RequestId":       crypto.randomUUID(),
  };
}

export const CieloApiDriver: BaseDriver = {
  nome: "Cielo API (eCommerce/Pay)",

  async iniciar(input, creds) {
    const c = creds as unknown as CredenciaisCielo;
    const ambiente = c.ambiente ?? "producao";
    const url = `${baseUrl(ambiente)}/1/sales/`;

    const valorCentavos = Math.round(input.valor * 100);

    // Para PIX: usa Payment.Type=Pix (gera QR code copia-cola)
    // Para Crédito/Débito sem cartão: precisa redirect → Cielo Checkout
    const isPix = input.metodo === "pix" || input.metodo === "qrcode";

    const orderId = input.terminal_id ?? input.pedido_id ?? crypto.randomUUID();

    const body = isPix ? {
      MerchantOrderId: orderId,
      Customer: { Name: "Cliente" },
      Payment: {
        Type:   "Pix",
        Amount: valorCentavos,
      },
    } : {
      MerchantOrderId: orderId,
      Customer: { Name: "Cliente" },
      Payment: {
        Type:        input.metodo === "debito" ? "DebitCard" : "CreditCard",
        Amount:      valorCentavos,
        Installments: input.metodo === "credito" ? (input.parcelas ?? 1) : 1,
        // Sem cartão → não funciona nativo, precisaria Cielo Checkout/Link Pay
        // Pra totem com PIX é a opção principal aqui.
      },
    };

    try {
      const r = await fetch(url, { method: "POST", headers: headers(c), body: JSON.stringify(body) });
      const d = await r.json();

      if (!r.ok) {
        return {
          transacao_id: input.terminal_id,
          modo: "imediato",
          status: "erro",
          mensagem: `Cielo: ${d?.[0]?.Message ?? `HTTP ${r.status}`}`,
        };
      }

      const paymentId  = d?.Payment?.PaymentId ?? null;
      const qrString   = d?.Payment?.QrCodeString ?? null;
      const qrBase64   = d?.Payment?.QrCodeBase64Image ?? null;
      const statusCode = d?.Payment?.Status;

      // Cielo status: 1=Autorizado, 2=PagamentoConfirmado, 3=Negado, 12=Pendente
      let st: IniciarPagamentoResult["status"] = "pendente";
      if (statusCode === 1 || statusCode === 2) st = "aprovada";
      else if (statusCode === 3) st = "recusada";
      else if (statusCode === 12) st = "pendente";

      return {
        transacao_id:  input.terminal_id,
        gateway_tx_id: paymentId,
        modo:          isPix ? "qr_code" : "imediato",
        qr_code:       qrString,
        qr_code_img:   qrBase64 ? `data:image/png;base64,${qrBase64}` : undefined,
        status:        st,
        mensagem:      d?.Payment?.ReturnMessage,
      };
    } catch (err) {
      return {
        transacao_id: input.terminal_id,
        modo: "imediato",
        status: "erro",
        mensagem: err instanceof Error ? err.message : "Falha Cielo",
      };
    }
  },

  async consultarStatus(_transacaoId, gatewayTxId, creds) {
    const c = creds as unknown as CredenciaisCielo;
    if (!gatewayTxId) return { transacao_id: _transacaoId, status: "pendente" };

    const url = `${queryUrl(c.ambiente ?? "producao")}/1/sales/${gatewayTxId}`;
    try {
      const r = await fetch(url, { headers: headers(c) });
      const d = await r.json();
      if (!r.ok) return { transacao_id: _transacaoId, status: "erro", mensagem: `HTTP ${r.status}` };

      const statusCode = d?.Payment?.Status;
      // 0=NotFinished, 1=Authorized, 2=PaymentConfirmed, 3=Denied, 10=Voided, 11=Refunded, 12=Pending, 13=Aborted, 20=Scheduled
      let status: StatusPagamento["status"] = "pendente";
      if (statusCode === 1 || statusCode === 2)   status = "aprovada";
      else if (statusCode === 3)                  status = "recusada";
      else if (statusCode === 10 || statusCode === 13) status = "cancelada";
      else if (statusCode === 12)                 status = "pendente";

      return {
        transacao_id:     _transacaoId,
        status,
        gateway_tx_id:    gatewayTxId,
        authorization_id: d?.Payment?.AuthorizationCode,
        bandeira:         d?.Payment?.Brand,
        ultimos_4:        d?.Payment?.CreditCard?.CardNumber?.slice(-4),
        mensagem:         d?.Payment?.ReturnMessage,
        pago_em:          d?.Payment?.CapturedDate,
      };
    } catch (err) {
      return { transacao_id: _transacaoId, status: "erro", mensagem: err instanceof Error ? err.message : "?" };
    }
  },
};
