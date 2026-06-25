package com.threedigital.threepay

import android.app.Activity
import android.content.Context
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Integração real com o SDK Cielo Order Manager (Cielo Smart / LIO / L400).
 *
 * Fluxo: createDraftOrder → addItem → placeOrder → checkoutOrder(PaymentListener).
 * Ao aprovar, imprime o comprovante do pedido no próprio terminal (PrinterManager).
 * O comprovante de pagamento (transação) o SDK já imprime automaticamente.
 *
 * Doc/SDK: https://developercielo.github.io/manual/lio-local
 * Sample:  https://github.com/DeveloperCielo/LIO-SDK-Sample-Integracao-Local
 * Maven:   com.cielo.lio:order-manager
 *
 * ⚠️ Os nomes de classe/método do SDK podem variar conforme a versão. Se algo
 * não compilar, confira contra o sample acima (PaymentActivity / PrintSampleActivity).
 * Pra testar SEM o SDK (ou sem terminal), ligue USAR_SIMULADOR = true.
 */

import cielo.orders.domain.Credentials
import cielo.sdk.order.OrderManager
import cielo.sdk.order.ServiceBindListener
import cielo.sdk.order.payment.Payment
import cielo.sdk.order.payment.PaymentError
import cielo.sdk.order.payment.PaymentListener
import cielo.sdk.printer.PrinterManager
import cielo.sdk.printer.PrinterAttributes
import cielo.sdk.printer.image.PrinterImage

data class ResultadoPagamento(
    val resultado: String,           // aprovada | recusada | cancelada | erro
    val authorizationId: String? = null,
    val nsu: String? = null,
    val bandeira: String? = null,
    val ultimos4: String? = null,
    val mensagem: String? = null,
) {
    companion object {
        fun aprovada(auth: String?, nsu: String?, bandeira: String?, u4: String?) =
            ResultadoPagamento("aprovada", auth, nsu, bandeira, u4, "Aprovado")
        fun recusada(msg: String?) = ResultadoPagamento("recusada", mensagem = msg ?: "Recusado")
        fun cancelada() = ResultadoPagamento("cancelada", mensagem = "Cancelado pelo cliente")
        fun erro(msg: String?) = ResultadoPagamento("erro", mensagem = msg ?: "Erro")
    }
}

object CieloPayment {

    /** true = simula aprovação (sem chamar o SDK). Pra testar fluxo sem terminal. */
    const val USAR_SIMULADOR = false

    private var orderManager: OrderManager? = null
    @Volatile private var pronto = false

    /** Inicializa e faz bind no serviço da Cielo. Chame no onCreate da Activity. */
    fun init(activity: Activity) {
        if (USAR_SIMULADOR) { pronto = true; return }
        if (orderManager != null) return
        val creds = Credentials(BuildConfig.CIELO_CLIENT_ID, BuildConfig.CIELO_ACCESS_TOKEN)
        val om = OrderManager(creds, activity)
        om.bind(activity, object : ServiceBindListener {
            override fun onServiceBound() { pronto = true; android.util.Log.d("ThreePay", "Cielo SDK bound") }
            override fun onServiceBoundError(throwable: Throwable?) { android.util.Log.w("ThreePay", "bind erro: ${throwable?.message}") }
            override fun onServiceUnbound() { pronto = false }
        })
        orderManager = om
    }

    fun release() {
        try { orderManager?.unbind() } catch (_: Exception) {}
        orderManager = null; pronto = false
    }

    fun estaPronto(): Boolean = pronto

    /**
     * Cobra no terminal e aguarda o resultado (suspende até o callback do SDK).
     * Deve ser chamado na main thread (o SDK abre a UI de pagamento no terminal).
     */
    suspend fun cobrar(activity: Activity, cobranca: Cobranca, onProgresso: (String) -> Unit = {}): ResultadoPagamento {
        if (USAR_SIMULADOR) {
            onProgresso("Aproxime, insira ou passe o cartão… (simulado)")
            kotlinx.coroutines.delay(3000)
            return ResultadoPagamento.aprovada("SIM" + (100000..999999).random(), (100000..999999).random().toString(), "visa", "1234")
        }

        val om = orderManager ?: return ResultadoPagamento.erro("SDK Cielo não inicializado")
        val centavos = Math.round(cobranca.valor * 100).toInt()

        return suspendCancellableCoroutine { cont ->
            try {
                val order = om.createDraftOrder("Pedido ${cobranca.pedidoId ?: cobranca.transacaoId}")
                order.addItem(
                    /* sku */ cobranca.pedidoId ?: cobranca.transacaoId,
                    /* name */ "Pedido",
                    /* unitPrice (centavos) */ centavos.toLong(),
                    /* quantity */ 1,
                    /* unitOfMeasure */ "EACH"
                )
                om.placeOrder(order)
                onProgresso("Aproxime, insira ou passe o cartão…")

                om.checkoutOrder(order, object : PaymentListener {
                    override fun onStart() { onProgresso("Processando…") }
                    override fun onPayment(paidOrder: cielo.orders.domain.Order?) {
                        // pagamento aprovado
                        val pay = paidOrder?.payments?.firstOrNull()
                        try { imprimirComprovante(activity, cobranca, pay) } catch (e: Exception) { android.util.Log.w("ThreePay", "print: ${e.message}") }
                        if (cont.isActive) cont.resume(
                            ResultadoPagamento.aprovada(
                                auth = pay?.authCode,
                                nsu = pay?.cieloCode ?: pay?.id,
                                bandeira = pay?.brand,
                                u4 = null,
                            )
                        )
                    }
                    override fun onCancel() { if (cont.isActive) cont.resume(ResultadoPagamento.cancelada()) }
                    override fun onError(error: PaymentError?) { if (cont.isActive) cont.resume(ResultadoPagamento.erro(error?.message)) }
                })
            } catch (e: Exception) {
                if (cont.isActive) cont.resume(ResultadoPagamento.erro(e.message))
            }
        }
    }

    /** Imprime o comprovante completo do pedido no terminal (best-effort). */
    private fun imprimirComprovante(context: Context, cobranca: Cobranca, pay: Payment?) {
        val printer = PrinterManager(context)
        val attrs = HashMap<Int, Int>()  // PrinterAttributes: alinhamento/tamanho (ver sample)
        val L = "--------------------------------\n"
        val sb = StringBuilder()
        sb.append("      THREE RESTAURANTES\n")
        sb.append(L)
        val ped = cobranca.pedido
        if (ped?.numero != null) sb.append("Pedido #${ped.numero}\n")
        if (!ped?.clienteNome.isNullOrBlank()) sb.append("Cliente: ${ped?.clienteNome}\n")
        sb.append(L)
        if (ped != null && ped.itens.isNotEmpty()) {
            for (it in ped.itens) {
                sb.append("${it.quantidade}x ${it.nome}\n")
                if (!it.observacoes.isNullOrBlank()) sb.append("   obs: ${it.observacoes}\n")
                sb.append("        R$ %.2f\n".format(it.subtotal))
            }
            sb.append(L)
            sb.append("TOTAL: R$ %.2f\n".format(ped.total))
        } else {
            sb.append("Valor: R$ %.2f\n".format(cobranca.valor))
        }
        sb.append(L)
        sb.append("Pagamento: ${cobranca.metodo}")
        if (cobranca.metodo == "credito" && cobranca.parcelas > 1) sb.append(" ${cobranca.parcelas}x")
        sb.append("\n")
        if (pay?.authCode != null) sb.append("Autorizacao: ${pay.authCode}\n")
        sb.append(L)
        sb.append("   Obrigado pela preferencia!\n\n\n")
        // API varia por versão: printText(text, attributes). Ajuste pelo sample se preciso.
        printer.printText(sb.toString(), attrs as MutableMap<Int, Int>)
    }
}
