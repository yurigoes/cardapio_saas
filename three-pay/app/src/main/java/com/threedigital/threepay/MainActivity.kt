package com.threedigital.threepay

import android.animation.Animator
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*

/**
 * App do terminal Cielo Smart (L400). Pareia com um terminal (agent_token),
 * faz polling de cobranças e dispara o pagamento via CieloPayment (SDK).
 */
class MainActivity : AppCompatActivity() {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var loopJob: Job? = null
    private var processando = false

    private lateinit var prefs: android.content.SharedPreferences
    private lateinit var status: TextView
    private lateinit var valorView: TextView
    private val animadores = mutableListOf<Animator>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("threepay", Context.MODE_PRIVATE)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        valorView = findViewById(R.id.valor)

        CieloPayment.init(this)

        val token = prefs.getString("agent_token", null)
        if (token.isNullOrBlank()) mostrarPareamento() else iniciarLoop(token)
    }

    private fun mostrarPareamento() {
        setContentView(R.layout.activity_pair)
        val input = findViewById<EditText>(R.id.tokenInput)
        findViewById<Button>(R.id.btnParear).setOnClickListener {
            val t = input.text.toString().trim()
            if (t.equals(TEST_TOKEN, ignoreCase = true)) { pagamentoTesteDemo(); return@setOnClickListener }
            if (t.length < 8) { input.error = "Token inválido"; return@setOnClickListener }
            prefs.edit().putString("agent_token", t).apply()
            recreate()
        }
        findViewById<Button>(R.id.btnTeste).setOnClickListener { pagamentoTesteDemo() }
    }

    /**
     * MODO DEMONSTRAÇÃO (certificação Cielo). Mostra o FLUXO REAL de telas do app
     * processando um pagamento de R$ 1,00 com aprovação simulada (sem chamar o SDK,
     * então não esbarra no bloqueio de transação do "modo de desenvolvimento").
     * Ativado pelo botão "Pagamento de teste" OU pareando com o token de teste.
     */
    private fun pagamentoTesteDemo() {
        CieloPayment.forcarDemo = true
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        valorView = findViewById(R.id.valor)
        animadores.forEach { it.cancel() }; animadores.clear()
        iniciarAnimacoes()

        val cobranca = Cobranca("TESTE-CERT", 1.00, "credito", 1, "TESTE", null)
        scope.launch {
            valorView.text = "R$ 1,00"; valorView.visibility = View.VISIBLE
            status.text = "Cobrança recebida — iniciando…"
            val res = try {
                CieloPayment.cobrar(this@MainActivity, cobranca) { m -> status.text = m }
            } catch (e: Exception) { ResultadoPagamento.erro(e.message) }
            status.text = if (res.resultado == "aprovada")
                "✅ Pagamento aprovado — R$ 1,00\nCrédito ${res.bandeira} ••••${res.ultimos4} · NSU ${res.nsu}"
            else "Resultado: ${res.mensagem}"
            delay(4500)
            mostrarPareamento()
        }
    }

    private fun iniciarLoop(token: String) {
        val api = ApiClient(BuildConfig.BACKEND_URL, token)
        iniciarAnimacoes()
        status.text = "Aguardando pedido"
        valorView.text = ""
        loopJob?.cancel()
        loopJob = scope.launch {
            while (isActive) {
                if (!processando) {
                    val cobranca = withContext(Dispatchers.IO) { runCatching { api.proxima() }.getOrNull() }
                    if (cobranca != null) processarCobranca(api, cobranca)
                }
                delay(3000)
            }
        }
    }

    /** Animações suaves da tela ociosa: glow respirando, logo flutuando, pontinhos. */
    private fun iniciarAnimacoes() {
        if (animadores.isNotEmpty()) return
        val glow = findViewById<View>(R.id.glow)
        val logoBlock = findViewById<View>(R.id.logoBlock)

        // entrada da logo
        logoBlock.alpha = 0f; logoBlock.scaleX = 0.7f; logoBlock.scaleY = 0.7f
        logoBlock.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(600).start()

        // flutuar
        addAnim(ObjectAnimator.ofFloat(logoBlock, "translationY", 0f, -16f).apply {
            duration = 2200; repeatMode = ObjectAnimator.REVERSE; repeatCount = ObjectAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
        })
        // glow respirando
        addAnim(ObjectAnimator.ofPropertyValuesHolder(glow,
            PropertyValuesHolder.ofFloat("scaleX", 1f, 1.18f),
            PropertyValuesHolder.ofFloat("scaleY", 1f, 1.18f),
            PropertyValuesHolder.ofFloat("alpha", 0.35f, 0.6f)).apply {
            duration = 1800; repeatMode = ObjectAnimator.REVERSE; repeatCount = ObjectAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
        })
        // pontinhos do "Aguardando"
        listOf(R.id.dot1, R.id.dot2, R.id.dot3).forEachIndexed { i, id ->
            val d = findViewById<View>(id)
            addAnim(ObjectAnimator.ofFloat(d, "alpha", 0.3f, 1f).apply {
                duration = 600; startDelay = (i * 200).toLong()
                repeatMode = ObjectAnimator.REVERSE; repeatCount = ObjectAnimator.INFINITE
            })
        }
    }

    private fun addAnim(a: Animator) { animadores.add(a); a.start() }

    private suspend fun processarCobranca(api: ApiClient, cobranca: Cobranca) {
        processando = true
        valorView.text = "R$ " + "%.2f".format(cobranca.valor).replace(".", ",")
        valorView.visibility = View.VISIBLE
        status.text = "Cobrança recebida — iniciando…"
        try {
            // cobrar() roda na main thread (o SDK abre a UI de pagamento no terminal)
            val res = CieloPayment.cobrar(this@MainActivity, cobranca) { msg -> status.text = msg }
            withContext(Dispatchers.IO) {
                runCatching {
                    api.resultado(
                        transacaoId = cobranca.transacaoId,
                        resultado = res.resultado,
                        authorizationId = res.authorizationId,
                        nsu = res.nsu,
                        bandeira = res.bandeira,
                        ultimos4 = res.ultimos4,
                        mensagem = res.mensagem,
                    )
                }
            }
            status.text = when (res.resultado) {
                "aprovada" -> "✅ Aprovado!"
                "recusada" -> "❌ Recusado"
                "cancelada" -> "Cancelado"
                else -> "Erro: ${res.mensagem}"
            }
            delay(2500)
        } catch (e: Exception) {
            status.text = "Erro: ${e.message}"
            delay(2500)
        } finally {
            processando = false
            status.text = "Aguardando pedido"
            valorView.text = ""
            valorView.visibility = View.GONE
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        animadores.forEach { it.cancel() }
        animadores.clear()
        scope.cancel()
        CieloPayment.release()
    }

    companion object {
        /** Token de teste da certificação Cielo — ativa o modo demonstração do pagamento. */
        const val TEST_TOKEN = "THREEPAY-TESTE-CIELO"
    }
}
