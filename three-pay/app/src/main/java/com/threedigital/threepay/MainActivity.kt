package com.threedigital.threepay

import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("threepay", Context.MODE_PRIVATE)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        valorView = findViewById(R.id.valor)

        val token = prefs.getString("agent_token", null)
        if (token.isNullOrBlank()) mostrarPareamento() else iniciarLoop(token)
    }

    private fun mostrarPareamento() {
        setContentView(R.layout.activity_pair)
        val input = findViewById<EditText>(R.id.tokenInput)
        findViewById<Button>(R.id.btnParear).setOnClickListener {
            val t = input.text.toString().trim()
            if (t.length < 8) { input.error = "Token inválido"; return@setOnClickListener }
            prefs.edit().putString("agent_token", t).apply()
            recreate()
        }
    }

    private fun iniciarLoop(token: String) {
        val api = ApiClient(BuildConfig.BACKEND_URL, token)
        status.text = "Aguardando pedido…"
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

    private suspend fun processarCobranca(api: ApiClient, cobranca: Cobranca) {
        processando = true
        valorView.text = "R$ " + "%.2f".format(cobranca.valor).replace(".", ",")
        status.text = "Cobrança recebida — iniciando…"
        try {
            val res = withContext(Dispatchers.IO) {
                CieloPayment.cobrar(this@MainActivity, cobranca) { msg ->
                    scope.launch { status.text = msg }
                }
            }
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
            status.text = "Aguardando pedido…"
            valorView.text = ""
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
