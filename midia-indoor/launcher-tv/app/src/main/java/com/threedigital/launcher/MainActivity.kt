package com.threedigital.launcher

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var txtHora: TextView
    private lateinit var txtData: TextView
    private lateinit var txtWifi: TextView
    private lateinit var iconWifi: TextView
    private lateinit var background: ImageView

    private val AUTO_LAUNCH_MS = 30_000L
    private val XIBO_PKG = "uk.org.xibo.client"
    private val RUSTDESK_PKG = "com.carriez.flutter_hbb"

    private val tickClock = object : Runnable {
        override fun run() { atualizarRelogio(); handler.postDelayed(this, 1000) }
    }
    private val tickWifi = object : Runnable {
        override fun run() { atualizarWifi(); handler.postDelayed(this, 5000) }
    }
    private val autoLaunch = Runnable {
        abrirApp(XIBO_PKG, silenciosoSeAusente = true)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        setContentView(R.layout.activity_main)

        txtHora = findViewById(R.id.txtHora)
        txtData = findViewById(R.id.txtData)
        txtWifi = findViewById(R.id.txtWifi)
        iconWifi = findViewById(R.id.iconWifi)
        background = findViewById(R.id.background)

        findViewById<View>(R.id.btnConfig).setOnClickListener {
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        findViewById<View>(R.id.btnRustDesk).setOnClickListener { abrirApp(RUSTDESK_PKG) }
        findViewById<View>(R.id.btnXibo).setOnClickListener { abrirApp(XIBO_PKG) }
        findViewById<View>(R.id.btnReboot).setOnClickListener { pedirReboot() }

        // Qualquer toque na tela reseta o timer de auto-launch
        findViewById<View>(R.id.root).setOnTouchListener { _, ev ->
            if (ev.action == MotionEvent.ACTION_DOWN) reagendarAutoLaunch()
            false
        }

        carregarWallpaper()
    }

    override fun onResume() {
        super.onResume()
        atualizarRelogio()
        atualizarWifi()
        handler.removeCallbacks(tickClock); handler.post(tickClock)
        handler.removeCallbacks(tickWifi);  handler.post(tickWifi)
        reagendarAutoLaunch()
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(tickClock)
        handler.removeCallbacks(tickWifi)
        handler.removeCallbacks(autoLaunch)
    }

    override fun onBackPressed() { /* HOME nao volta */ }

    private fun reagendarAutoLaunch() {
        handler.removeCallbacks(autoLaunch)
        handler.postDelayed(autoLaunch, AUTO_LAUNCH_MS)
    }

    private fun atualizarRelogio() {
        val agora = Date()
        txtHora.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(agora)
        txtData.text = SimpleDateFormat("EEEE, dd 'de' MMMM 'de' yyyy", Locale("pt", "BR")).format(agora)
    }

    @Suppress("DEPRECATION")
    private fun atualizarWifi() {
        try {
            val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
            val net = cm.activeNetwork
            val caps = cm.getNetworkCapabilities(net)
            val onlineWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

            if (!online) {
                iconWifi.text = "⚠"  // ⚠
                txtWifi.text = "Sem conexão"
                return
            }

            if (onlineWifi) {
                val wm = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
                val ssid = wm.connectionInfo?.ssid?.trim('"')?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
                iconWifi.text = "📶"  // 📶
                txtWifi.text = ssid ?: "Wi-Fi"
            } else {
                iconWifi.text = "🌐"  // 🌐
                txtWifi.text = "Ethernet"
            }
        } catch (e: Exception) {
            iconWifi.text = "?"
            txtWifi.text = "—"
        }
    }

    private fun carregarWallpaper() {
        // Detecta orientacao atual da tela e prioriza o wallpaper certo
        val ehPaisagem = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val sufixoPreferido = if (ehPaisagem) "paisagem" else "retrato"
        val sufixoFallback  = if (ehPaisagem) "retrato"  else "paisagem"
        android.util.Log.d("ThreeLauncher", "Orientacao=${if (ehPaisagem) "paisagem" else "retrato"}, prefere wallpaper-$sufixoPreferido")

        // Ordem de busca: sufixo preferido > sem sufixo > sufixo fallback
        val nomes = listOf(
            "three_wallpaper-$sufixoPreferido.png",
            "three_wallpaper-$sufixoPreferido.jpg",
            "three_wallpaper.png",
            "three_wallpaper.jpg",
            "three_wallpaper-$sufixoFallback.png",
            "three_wallpaper-$sufixoFallback.jpg"
        )
        val pastas = mutableListOf<String>().apply {
            filesDir?.let { add(it.absolutePath) }
            getExternalFilesDir(null)?.let { add(it.absolutePath) }
            add("/sdcard")
            add("/sdcard/Download")
            add("/storage/emulated/0")
        }
        val candidatos = mutableListOf<String>()
        for (nome in nomes) for (pasta in pastas) candidatos.add("$pasta/$nome")
        android.util.Log.d("ThreeLauncher", "Procurando wallpaper em ${candidatos.size} caminhos...")
        for (path in candidatos) {
            val f = File(path)
            val existe = f.exists()
            val tamanho = if (existe) f.length() else 0L
            android.util.Log.d("ThreeLauncher", "  $path -> existe=$existe size=$tamanho")
            if (existe && tamanho > 0) {
                try {
                    val bmp = BitmapFactory.decodeFile(path)
                    if (bmp != null) {
                        background.setImageBitmap(bmp)
                        android.util.Log.d("ThreeLauncher", "Wallpaper carregado: $path (${bmp.width}x${bmp.height})")
                        return
                    } else {
                        android.util.Log.w("ThreeLauncher", "decodeFile retornou null: $path")
                    }
                } catch (e: Exception) {
                    android.util.Log.w("ThreeLauncher", "Erro decodificando $path: ${e.message}")
                }
            }
        }
        android.util.Log.w("ThreeLauncher", "Nenhum wallpaper encontrado — mantendo gradient default")
    }

    private fun abrirApp(pacote: String, silenciosoSeAusente: Boolean = false) {
        val intent = packageManager.getLaunchIntentForPackage(pacote)
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            startActivity(intent)
        } else if (!silenciosoSeAusente) {
            Toast.makeText(this, "App não instalado: $pacote", Toast.LENGTH_SHORT).show()
        }
    }

    private fun pedirReboot() {
        AlertDialog.Builder(this)
            .setTitle("Reiniciar dispositivo?")
            .setMessage("O TV-box vai reiniciar agora.")
            .setPositiveButton("Reiniciar") { _, _ -> tentarReboot() }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun tentarReboot() {
        // Tenta via PowerManager (precisa permissao REBOOT — so com root/system)
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            pm.reboot(null)
            return
        } catch (e: Exception) { /* fallback */ }
        // Fallback: tenta via shell (so funciona em devices com root)
        try {
            Runtime.getRuntime().exec(arrayOf("su", "-c", "reboot"))
            return
        } catch (e: Exception) { /* sem permissao */ }
        Toast.makeText(this, "Sem permissão pra reiniciar (precisa root)", Toast.LENGTH_LONG).show()
    }
}
