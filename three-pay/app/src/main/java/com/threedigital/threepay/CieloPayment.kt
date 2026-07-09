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

    /** Compile-time apenas: true simula (build de dev sem terminal). Produção/certificação = false. */
    const val USAR_SIMULADOR = false

    private var orderManager: OrderManager? = null
    @Volatile private var pronto = false

    /** Último erro real de init/bind do SDK — exibido na tela para diagnóstico. */
    @Volatile var ultimoErro: String? = null
        private set

    /** Inicializa e faz bind no serviço da Cielo. Chame no onCreate da Activity. */
    fun init(activity: Activity) {
        if (USAR_SIMULADOR) { pronto = true; return }
        if (orderManager != null) return
        try {
            val creds = Credentials(BuildConfig.CIELO_CLIENT_ID, BuildConfig.CIELO_ACCESS_TOKEN)
            val om = OrderManager(creds, activity)
            om.bind(activity, object : ServiceBindListener {
                override fun onServiceBound() { pronto = true; ultimoErro = null; android.util.Log.d("ThreePay", "Cielo SDK bound") }
                override fun onServiceBoundError(throwable: Throwable) { pronto = false; ultimoErro = "bind: ${throwable.message}"; android.util.Log.e("ThreePay", "Cielo bind erro", throwable) }
                override fun onServiceUnbound() { pronto = false }
            })
            orderManager = om
        } catch (e: Throwable) {
            ultimoErro = "${e.javaClass.simpleName}: ${e.message}"
            android.util.Log.e("ThreePay", "Falha ao iniciar SDK Cielo", e)
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
        // Build de desenvolvimento sem terminal (compile-time). Em produção/cert = false.
        if (USAR_SIMULADOR) {
            onProgresso("Aproxime, insira ou passe o cartão… (simulado)")
            kotlinx.coroutines.delay(2500)
            return ResultadoPagamento.aprovada("SIM" + (100000..999999).random(), (100000..999999).random().toString(), "VISA", "1234")
        }

        // Garante a inicialização e AGUARDA o bind do serviço Cielo (assíncrono) antes de cobrar.
        if (orderManager == null) init(activity)
        var esperou = 0
        while (!pronto && orderManager != null && esperou < 8000) { kotlinx.coroutines.delay(300); esperou += 300 }

        val om = orderManager
            ?: return ResultadoPagamento.erro("SDK Cielo não inicializado" + (ultimoErro?.let { " — $it" } ?: ""))
        if (!pronto)
            return ResultadoPagamento.erro("Serviço de pagamento Cielo não conectou" + (ultimoErro?.let { " — $it" } ?: ""))

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
