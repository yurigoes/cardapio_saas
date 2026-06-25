package com.threedigital.threepay

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Cliente HTTP do backend Three (fila de cobranças por terminal).
 * Endpoints:
 *   GET  /api/terminal-agent/proxima?token=AGENT_TOKEN
 *   POST /api/terminal-agent/resultado
 */
data class Cobranca(
    val transacaoId: String,
    val valor: Double,
    val metodo: String,
    val parcelas: Int,
    val pedidoId: String?,
)

class ApiClient(private val backendUrl: String, private val agentToken: String) {

    /** Busca a próxima cobrança pendente. Retorna null se não houver. */
    fun proxima(): Cobranca? {
        val url = URL("$backendUrl/api/terminal-agent/proxima?token=$agentToken")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"; connectTimeout = 8000; readTimeout = 12000
        }
        try {
            if (conn.responseCode !in 200..299) return null
            val body = conn.inputStream.bufferedReader().readText()
            val json = JSONObject(body)
            val data = json.optJSONObject("data") ?: return null
            val c = data.optJSONObject("cobranca") ?: return null
            return Cobranca(
                transacaoId = c.getString("transacao_id"),
                valor       = c.getDouble("valor"),
                metodo      = c.getString("metodo"),
                parcelas    = c.optInt("parcelas", 1),
                pedidoId    = c.optString("pedido_id", null),
            )
        } finally { conn.disconnect() }
    }

    /** Devolve o resultado de uma cobrança. */
    fun resultado(
        transacaoId: String,
        resultado: String,            // aprovada | recusada | cancelada | erro
        authorizationId: String? = null,
        nsu: String? = null,
        bandeira: String? = null,
        ultimos4: String? = null,
        mensagem: String? = null,
    ): Boolean {
        val url = URL("$backendUrl/api/terminal-agent/resultado")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true
            connectTimeout = 8000; readTimeout = 12000
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            val payload = JSONObject().apply {
                put("token", agentToken)
                put("transacao_id", transacaoId)
                put("resultado", resultado)
                authorizationId?.let { put("authorization_id", it) }
                nsu?.let { put("nsu", it) }
                bandeira?.let { put("bandeira", it) }
                ultimos4?.let { put("ultimos_4", it) }
                mensagem?.let { put("mensagem", it) }
            }
            conn.outputStream.use { it.write(payload.toString().toByteArray()) }
            return conn.responseCode in 200..299
        } finally { conn.disconnect() }
    }
}
