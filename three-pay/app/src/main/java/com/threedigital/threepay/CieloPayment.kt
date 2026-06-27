package com.threedigital.threepay

import android.app.Activity
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Integração com o SDK Cielo Order Manager (Cielo Smart / LIO / L400), v2.7.2.
 *
 * Fluxo: createDraftOrder → addItem → placeOrder → checkoutOrder(orderId, PaymentListener).
 * Na v2.7.2 o PaymentListener tem só onPayment(order) — disparado quando o
 * pagamento conclui. O SDK abre a UI de pagamento no próprio terminal.
 *
 * Doc/SDK: https://developercielo.github.io/manual/lio-local
 * Sample:  https://github.com/DeveloperCielo/LIO-SDK-Sample-Integracao-Local
 *
 * ⚠️ Impressão do comprovante (PrinterManager) será adicionada depois — primeiro
 * validamos o pagamento na máquina real. Pra testar sem terminal: USAR_SIMULADOR=true.
 */

import cielo.orders.domain.Credentials
import cielo.orders.domain.Order
import cielo.sdk.order.OrderManager
import cielo.sdk.order.ServiceBindListener
import cielo.sdk.order.payment.PaymentListener
import cielo.sdk.order.payment.PaymentError

data class ResultadoPagamento(
    val resultado: String,           // aprovada | recusada | cancelada | erro
    val authorizationId: String? = null,
    val nsu: String? = null,
    val bandeira: String? = null,
    val ultimos4: String? = null,
    val mensagem: String? = null,
) {
    companion object {
        fun aprovada(auth: String? = null, nsu: String? = null, bandeira: String? = null, u4: String? = null) =
            ResultadoPagamento("aprovada", auth, nsu, bandeira, u4, "Aprovado")
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
        // Em dispositivos sem o serviço/SDK Cielo (emuladores comuns como MEmu/BlueStacks),
        // a inicialização pode lançar UnsatisfiedLinkError/NoClassDefFoundError. Protegemos
        // pra não derrubar o app — o pagamento só funciona no terminal Cielo real.
        try {
            val creds = Credentials(BuildConfig.CIELO_CLIENT_ID, BuildConfig.CIELO_ACCESS_TOKEN)
            val om = OrderManager(creds, activity)
            om.bind(activity, object : ServiceBindListener {
                override fun onServiceBound() { pronto = true; android.util.Log.d("ThreePay", "Cielo SDK bound") }
                override fun onServiceBoundError(throwable: Throwable) { android.util.Log.w("ThreePay", "bind erro: ${throwable.message}") }
                override fun onServiceUnbound() { pronto = false }
            })
            orderManager = om
        } catch (e: Throwable) {
            android.util.Log.e("ThreePay", "SDK Cielo indisponivel (terminal nao-Cielo?): ${e.message}")
        }
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
        val centavos = Math.round(cobranca.valor * 100)

        return suspendCancellableCoroutine { cont ->
            try {
                val order: Order? = om.createDraftOrder("Pedido ${cobranca.pedidoId ?: cobranca.transacaoId}")
                if (order == null) { cont.resume(ResultadoPagamento.erro("Falha ao criar pedido")); return@suspendCancellableCoroutine }
                order.addItem(
                    /* sku */ cobranca.pedidoId ?: cobranca.transacaoId,
                    /* name */ "Pedido",
                    /* unitPrice (centavos) */ centavos,
                    /* quantity */ 1,
                    /* unitOfMeasure */ "UN"
                )
                om.placeOrder(order)
                onProgresso("Aproxime, insira ou passe o cartão…")

                om.checkoutOrder(order.id, object : PaymentListener {
                    override fun onStart() { /* SDK iniciou o fluxo de pagamento no terminal */ }
                    override fun onPayment(paidOrder: Order) {
                        if (cont.isActive) cont.resume(ResultadoPagamento.aprovada())
                    }
                    override fun onCancel() {
                        if (cont.isActive) cont.resume(ResultadoPagamento.cancelada())
                    }
                    override fun onError(error: PaymentError) {
                        if (cont.isActive) cont.resume(ResultadoPagamento.erro(error.toString()))
                    }
                })
            } catch (e: Exception) {
                if (cont.isActive) cont.resume(ResultadoPagamento.erro(e.message))
            }
        }
    }
}
