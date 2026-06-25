package com.threedigital.threepay

import android.content.Context

/**
 * Ponte com o SDK de pagamento da Cielo (Order Manager) no terminal Smart/L400.
 *
 * ⚠️ STUB: hoje SIMULA uma aprovação após 3s. Substitua a função `cobrar()`
 * pela chamada real do OrderManager quando tiver o SDK + Client-Id/Access-Token
 * (Cielo Dev Portal > Perfil > Client-IDs Cadastrados).
 *
 * Esboço da integração real (pseudo-código, ajuste conforme a versão do SDK):
 *
 *   val credentials = Credentials(CLIENT_ID, ACCESS_TOKEN)
 *   val orderManager = OrderManager(credentials, context)
 *   val order = orderManager.createDraftOrder("Pedido ${cobranca.pedidoId}")
 *   order.addItem(...)            // 1 item com o valor total (em centavos)
 *   order.placeOrder()
 *   orderManager.checkout(order, object : PaymentListener {
 *      override fun onPayment(order) { -> ResultadoPagamento.aprovada(...) }
 *      override fun onCancel()        { -> ResultadoPagamento.cancelada() }
 *      override fun onError(e)        { -> ResultadoPagamento.erro(e.message) }
 *   })
 *
 * O método de pagamento (crédito/débito/PIX) vem de `cobranca.metodo`.
 */

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

    // TODO Estágio 2: receber e guardar as credenciais reais (BuildConfig/local.properties)
    // const val CLIENT_ID = BuildConfig.CIELO_CLIENT_ID
    // const val ACCESS_TOKEN = BuildConfig.CIELO_ACCESS_TOKEN

    /**
     * Cobra no terminal. BLOQUEANTE — chame fora da main thread.
     * @param onProgresso callback opcional pra atualizar a UI ("Insira o cartão", etc)
     */
    fun cobrar(
        context: Context,
        cobranca: Cobranca,
        onProgresso: (String) -> Unit = {},
    ): ResultadoPagamento {
        // ───────────────────────────────────────────────────────────────
        // STUB: simula o fluxo do terminal. TROCAR pela chamada do SDK Cielo.
        // ───────────────────────────────────────────────────────────────
        onProgresso("Aproxime, insira ou passe o cartão…")
        Thread.sleep(3000)
        return ResultadoPagamento.aprovada(
            auth = "SIM" + (100000..999999).random(),
            nsu = (100000..999999).random().toString(),
            bandeira = "visa",
            u4 = "1234",
        )
        // ───────────────────────────────────────────────────────────────
    }
}
