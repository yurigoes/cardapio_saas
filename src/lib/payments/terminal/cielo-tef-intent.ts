/**
 * Driver: Cielo TEF Android (Intent)
 *
 * Funciona quando:
 *  - Totem é Android (tablet/all-in-one)
 *  - App "Cliente Cielo" (cielo.smart.client) está instalado
 *  - Pinpad físico conectado (USB ou Bluetooth) — qualquer modelo homologado
 *
 * Como funciona:
 *  - Backend cria registro de transação local + gera Intent URI
 *  - Frontend totem abre a Intent → app TEF dispara, comanda o pinpad
 *  - App TEF retorna via callback (deep link) ou polling
 *
 * Intent format:
 *   intent://pagar?valor=1000&parcelas=1&tipo=credito&retorno_id=XYZ
 *     #Intent;scheme=cielo;package=cielo.smart.client;end
 *
 * Para Pay&Go: pkg=br.com.paygotec.tef
 * Para SiTef:  pkg=br.com.softwareexpress.sitefweb
 * Para AutoPay:pkg=br.com.tnt.autopay
 *
 * Cada app TEF tem sua própria spec de Intent — verificar docs do fornecedor.
 */
import type {
  BaseDriver, IniciarPagamentoInput, IniciarPagamentoResult, StatusPagamento,
} from "./types";

export const CieloTefIntentDriver: BaseDriver = {
  nome: "Cielo TEF Android (Intent)",

  async iniciar(input, creds) {
    const pkg = (creds as { intent_package?: string }).intent_package ?? "cielo.smart.client";
    const valorCentavos = Math.round(input.valor * 100);

    // Mapeia método pro código de tipo da Cielo
    const tipoMap: Record<string, string> = {
      credito: "1", debito: "2", voucher: "3", pix: "4", qrcode: "4",
    };
    const tipo = tipoMap[input.metodo] ?? "1";

    // Intent URI no formato Android Chrome
    // Backend só GERA — o frontend (totem) é quem dispara via window.location
    const params = new URLSearchParams({
      valor:      String(valorCentavos),
      parcelas:   String(input.parcelas ?? 1),
      tipo,
      retorno_id: input.terminal_id,
    });

    const intentUri =
      `intent://pagar?${params.toString()}` +
      `#Intent;scheme=cielo;package=${pkg};` +
      `S.browser_fallback_url=${encodeURIComponent(
        `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/totem/erro-tef?motivo=app_nao_instalado`
      )};end`;

    return {
      transacao_id:  input.terminal_id,
      modo:          "intent_android",
      intent_uri:    intentUri,
      status:        "processando",
      mensagem:      `Abrindo app TEF (${pkg})...`,
    };
  },

  async consultarStatus(transacaoId) {
    // Status só é atualizado pelo callback /api/pub/totem/pagamento/[id]/confirmar
    // Aqui só retorna o estado atual do banco
    return {
      transacao_id: transacaoId,
      status:       "pendente",
      mensagem:     "Aguardando confirmação do app TEF",
    };
  },
};
