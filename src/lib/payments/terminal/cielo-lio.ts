/**
 * Driver: Cielo LIO (Order Manager API v1)
 *
 * Pra estabelecimentos que TÊM um terminal Cielo LIO (Android nativo da Cielo).
 * Em vez de Intent local, manda comando via API REST pra LIO específica
 * (identificada por LIOSerial ou Merchant ID). LIO recebe push, pede cartão
 * ao cliente, processa, retorna.
 *
 * Docs: https://developercielo.github.io/manual/cielo-lio
 *
 * Fluxo:
 *  1. POST /v1/orders → cria order com itens + valor
 *  2. POST /v1/orders/{id}/transactions → dispara cobrança na LIO
 *  3. GET /v1/orders/{id} → polling até status PAID/REJECTED
 *
 * Vantagem vs TEF Intent: não precisa app no totem, totem pode ser web puro.
 * LIO comunica via 3G/4G/Wi-Fi com servidor Cielo, totem polla nosso backend.
 */
import type {
  BaseDriver, IniciarPagamentoInput, IniciarPagamentoResult, StatusPagamento,
} from "./types";

interface CredenciaisCieloLio {
  client_id:      string;     // OAuth client_id da Cielo Lio Manager
  client_secret:  string;     // OAuth client_secret
  lio_serial?:    string;     // serial da LIO destino (opcional, se conta tem várias)
  merchant_id?:   string;
  ambiente?:      "producao" | "sandbox";
}

function baseUrl(ambiente: string): string {
  return ambiente === "sandbox"
    ? "https://api-cieloecommerce.cielo.com.br/sandbox"   // sandbox URL pode variar
    : "https://api-cieloecommerce.cielo.com.br";
}

// Cache de tokens OAuth por client_id (válidos por ~1h)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(c: CredenciaisCieloLio): Promise<string> {
  const cached = tokenCache.get(c.client_id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const basic = Buffer.from(`${c.client_id}:${c.client_secret}`).toString("base64");
  const r = await fetch(`${baseUrl(c.ambiente ?? "producao")}/api/public/v1/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) {
    throw new Error(`Cielo LIO auth falhou: HTTP ${r.status}`);
  }
  const d = await r.json();
  const token   = d.access_token;
  const expires = Date.now() + ((d.expires_in ?? 3600) * 1000);
  tokenCache.set(c.client_id, { token, expiresAt: expires });
  return token;
}

function headers(token: string, c: CredenciaisCieloLio): HeadersInit {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`,
    ...(c.merchant_id ? { "Merchant-Id": c.merchant_id } : {}),
    ...(c.lio_serial  ? { "Lio-Serial":  c.lio_serial  } : {}),
  };
}

export const CieloLioDriver: BaseDriver = {
  nome: "Cielo LIO (Order Manager)",

  async iniciar(input, creds) {
    const c = creds as unknown as CredenciaisCieloLio;
    try {
      const token = await getAccessToken(c);
      const valorCentavos = Math.round(input.valor * 100);

      // Mapeia método
      const tipoPag = input.metodo === "pix"
        ? "PIX"
        : input.metodo === "debito"
          ? "DEBITO"
          : "CREDITO";

      // Cria order
      const orderBody = {
        reference:     input.terminal_id,
        price:         valorCentavos,
        currency:      "BRL",
        items: [{
          reference:   input.pedido_id ?? input.terminal_id,
          name:        `Pedido ${input.pedido_id?.slice(0,8) ?? "totem"}`,
          unitPrice:   valorCentavos,
          quantity:    1,
          unitOfMeasure: "EACH",
        }],
        notification: {
          type:        "HTTP",
          url:         `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/cielo-lio`,
        },
      };

      const orderRes = await fetch(`${baseUrl(c.ambiente ?? "producao")}/api/public/v1/orders`, {
        method: "POST", headers: headers(token, c), body: JSON.stringify(orderBody),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) {
        return {
          transacao_id: input.terminal_id,
          modo: "imediato",
          status: "erro",
          mensagem: `Cielo LIO: ${order?.[0]?.Message ?? order?.message ?? `HTTP ${orderRes.status}`}`,
        };
      }

      // Dispara cobrança na LIO
      const txBody = {
        amount:    valorCentavos,
        paymentType: tipoPag,
        installments: input.parcelas ?? 1,
        installmentType: "MERCHANT",
      };
      const txRes = await fetch(
        `${baseUrl(c.ambiente ?? "producao")}/api/public/v1/orders/${order.id}/transactions`,
        { method: "POST", headers: headers(token, c), body: JSON.stringify(txBody) }
      );
      const tx = await txRes.json();
      if (!txRes.ok) {
        return {
          transacao_id: input.terminal_id,
          modo: "imediato",
          status: "erro",
          mensagem: `Cielo LIO tx: ${tx?.message ?? `HTTP ${txRes.status}`}`,
        };
      }

      return {
        transacao_id:  input.terminal_id,
        gateway_tx_id: order.id,
        modo:          "polling_local",   // totem polla backend (que polla cielo)
        status:        "processando",
        mensagem:      "Aguardando cliente passar cartão no terminal LIO",
      };
    } catch (err) {
      return {
        transacao_id: input.terminal_id,
        modo: "imediato",
        status: "erro",
        mensagem: err instanceof Error ? err.message : "Erro Cielo LIO",
      };
    }
  },

  async consultarStatus(transacaoId, gatewayTxId, creds) {
    const c = creds as unknown as CredenciaisCieloLio;
    if (!gatewayTxId) return { transacao_id: transacaoId, status: "pendente" };
    try {
      const token = await getAccessToken(c);
      const r = await fetch(
        `${baseUrl(c.ambiente ?? "producao")}/api/public/v1/orders/${gatewayTxId}`,
        { headers: headers(token, c) }
      );
      const d = await r.json();
      if (!r.ok) return { transacao_id: transacaoId, status: "erro", mensagem: `HTTP ${r.status}` };

      // Order status: DRAFT, ENTERED, PAID, REJECTED, CANCELED, CLOSED
      const status: StatusPagamento["status"] =
        d.status === "PAID"     ? "aprovada" :
        d.status === "REJECTED" ? "recusada" :
        d.status === "CANCELED" ? "cancelada" :
                                   "processando";

      // Última transação aprovada
      const lastTx = (d.transactions ?? []).slice(-1)[0];

      return {
        transacao_id:     transacaoId,
        status,
        gateway_tx_id:    gatewayTxId,
        authorization_id: lastTx?.authorizationCode,
        bandeira:         lastTx?.brand,
        ultimos_4:        lastTx?.cardInfo?.cardNumber?.slice(-4),
        mensagem:         lastTx?.acquirerResponseCode,
        pago_em:          d.dateUpdated,
      };
    } catch (err) {
      return { transacao_id: transacaoId, status: "erro", mensagem: err instanceof Error ? err.message : "?" };
    }
  },

  async cancelar(transacaoId, gatewayTxId, creds) {
    const c = creds as unknown as CredenciaisCieloLio;
    if (!gatewayTxId) return { ok: false, mensagem: "Sem gateway_tx_id" };
    try {
      const token = await getAccessToken(c);
      const r = await fetch(
        `${baseUrl(c.ambiente ?? "producao")}/api/public/v1/orders/${gatewayTxId}/cancel`,
        { method: "PUT", headers: headers(token, c) }
      );
      return { ok: r.ok };
    } catch (err) {
      return { ok: false, mensagem: err instanceof Error ? err.message : "?" };
    }
  },
};
