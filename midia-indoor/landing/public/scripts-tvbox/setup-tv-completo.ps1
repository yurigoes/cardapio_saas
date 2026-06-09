# setup-tv-completo.ps1
# Provisiona uma TV box do zero:
#  1. Instala APK Xibo customizado (Three Digital Player)
#  2. Pre-configura CMS + Server Key + Display Name unico
#  3. Instala RustDesk (acesso remoto)
#  4. Pre-configura RustDesk com servidor proprio + senha padrao
#  5. Habilita permissoes (clipboard, file transfer, etc)
#  6. Inicia servico RustDesk e tenta auto-aceitar captura de tela
#  7. Captura RustDesk ID e envia pro SaaS via API
#
# Uso:
#   .\setup-tv-completo.ps1 -Ip 192.168.15.51
#   .\setup-tv-completo.ps1 -Ip 192.168.15.51 -DisplayName "TD-LOJA-01"

param(
  [Parameter(Mandatory=$true)] [string]$Ip,
  [string]$DisplayName = "",
  [string]$XiboApk = "A:\Sistemas\xibo-mod\xibo-modificado.apk",
  [string]$RustDeskApk = "A:\Sistemas\rustdesk\rustdesk.apk",
  [string]$CmsAddress = "https://midia.tthreedigital.com.br",
  [string]$ServerKey = "2IG5P8rP",
  [string]$RustServer = "178.105.111.15",
  [string]$RustKey = "9fjEt0kExiLT6aQmexCiXUddUiU67IlpwV4MlzDPeo0=",
  [string]$RustSenha = "td2026",
  [string]$SaasUrl = "https://midia.tthreedigital.com.br",
  [string]$ProvisionSecret = "td-provision-2026"
)

$ErrorActionPreference = "Stop"
$device = "${Ip}:5555"

function Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "   ! $msg"  -ForegroundColor Yellow }

# ---------- 1) Conexao ADB ----------
Step "Conectando ao dispositivo $device"
adb connect $device | Out-Null
Start-Sleep -Seconds 2
$state = (adb -s $device get-state 2>$null)
if ($state -ne "device") { throw "Nao consegui conectar em $device (estado=$state)" }
Ok "ADB conectado"

# Pega MAC pra usar como identidade (tenta varias interfaces)
$mac = ""
foreach ($iface in @("wlan0","eth0","wlan1","ra0","p2p0")) {
  $val = (adb -s $device shell "cat /sys/class/net/$iface/address 2>/dev/null" 2>$null).Trim()
  if ($val -and $val -ne "00:00:00:00:00:00") { $mac = $val.ToUpper(); break }
}
if (-not $mac) {
  # fallback: tenta `ip link` ou getprop
  $ipout = (adb -s $device shell "ip link 2>/dev/null | grep -oE '([0-9a-f]{2}:){5}[0-9a-f]{2}' | head -1").Trim()
  if ($ipout) { $mac = $ipout.ToUpper() }
}
if (-not $mac) {
  $mac = "02:00:00:" + ((1..3 | ForEach-Object { "{0:X2}" -f (Get-Random -Min 0 -Max 255) }) -join ":")
  Warn "MAC nao detectado, gerando fake: $mac"
}
if (-not $DisplayName) {
  $semDoisPts = $mac -replace ":",""
  $len = $semDoisPts.Length
  $take = [Math]::Min(4, $len)
  $suffix = if ($take -gt 0) { $semDoisPts.Substring($len - $take) } else { (Get-Random -Min 1000 -Max 9999).ToString() }
  $DisplayName = "TD-$suffix"
}
Ok "MAC=$mac DisplayName=$DisplayName"

# ---------- 2) Xibo modificado ----------
Step "Instalando Xibo (Three Digital Player)"
if (-not (Test-Path $XiboApk)) { throw "APK Xibo nao encontrado em $XiboApk" }
adb -s $device install -r -g $XiboApk | Out-Null
Ok "Xibo instalado"

Step "Pre-configurando CMS no Xibo (SharedPreferences)"
adb -s $device shell "am force-stop uk.org.xibo.client" | Out-Null
$prefsXml = @"
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=`"prefs_cms_address`">$CmsAddress</string>
    <string name=`"prefs_server_key`">$ServerKey</string>
    <string name=`"prefs_display_name`">$DisplayName</string>
    <string name=`"prefs_hardware_key`"></string>
    <boolean name=`"prefs_screensaver_enabled`" value=`"false`" />
</map>
"@
$tmp = New-TemporaryFile
$prefsXml | Out-File -FilePath $tmp.FullName -Encoding utf8 -NoNewline
adb -s $device push $tmp.FullName "/sdcard/xibo_prefs.xml" | Out-Null
adb -s $device shell "run-as uk.org.xibo.client mkdir -p shared_prefs 2>/dev/null; cp /sdcard/xibo_prefs.xml /data/local/tmp/x.xml; cat /data/local/tmp/x.xml | run-as uk.org.xibo.client tee shared_prefs/uk.org.xibo.client_preferences.xml >/dev/null" | Out-Null
Remove-Item $tmp.FullName -ErrorAction SilentlyContinue
adb -s $device shell "am start -n uk.org.xibo.client/.MainActivity" | Out-Null
Ok "Xibo configurado e iniciado"

# ---------- 3) RustDesk ----------
Step "Instalando RustDesk"
if (-not (Test-Path $RustDeskApk)) { throw "APK RustDesk nao encontrado em $RustDeskApk" }
adb -s $device install -r -g $RustDeskApk | Out-Null
Ok "RustDesk instalado"

Step "Inicializando RustDesk pra criar diretorios"
adb -s $device shell "am start -n com.carriez.flutter_hbb/.MainActivity" | Out-Null
Start-Sleep -Seconds 8
adb -s $device shell "am force-stop com.carriez.flutter_hbb" | Out-Null

Step "Pre-configurando RustDesk (servidor + key + permissoes)"
$rd2 = @"
rendezvous_server = '${RustServer}:21116'
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = '$RustServer'
relay-server = '$RustServer'
api-server = ''
key = '$RustKey'
direct-server = 'Y'
enable-audio = 'N'
enable-clipboard = 'Y'
enable-file-transfer = 'Y'
enable-keyboard = 'Y'
enable-tunnel = 'Y'
allow-auto-record-incoming = 'N'
verification-method = 'use-permanent-password'
approve-mode = 'password'
"@
$tmp2 = New-TemporaryFile
$rd2 | Out-File -FilePath $tmp2.FullName -Encoding utf8 -NoNewline
adb -s $device push $tmp2.FullName "/sdcard/RustDesk2.toml" | Out-Null
$uid = (adb -s $device shell "stat -c %u /data/data/com.carriez.flutter_hbb").Trim()
adb -s $device shell "cp /sdcard/RustDesk2.toml /data/local/tmp/r2.toml; cat /data/local/tmp/r2.toml | run-as com.carriez.flutter_hbb tee app_flutter/RustDesk2.toml >/dev/null" | Out-Null
Remove-Item $tmp2.FullName -ErrorAction SilentlyContinue
Ok "RustDesk2.toml gravado"

# ---------- 4) Iniciar servico + tap automatico ----------
Step "Abrindo RustDesk e tentando iniciar servico"
adb -s $device shell "am start -n com.carriez.flutter_hbb/.MainActivity" | Out-Null
Start-Sleep -Seconds 5

# Vai pra aba "Compartilhar Tela"
# Tap nas coords da tab (geralmente terceira tab no rodape, ajustar se preciso)
$size = (adb -s $device shell "wm size").Trim()
Ok "Tela: $size"

# Tap no botao "Iniciar Servico" (azul, parte superior)
# Coords aproximadas: x=meio, y=140
adb -s $device shell "input tap 360 290" | Out-Null
Start-Sleep -Seconds 3
# Tap em "Iniciar agora" / "Start now" do popup do MediaProjection (canto direito)
adb -s $device shell "input tap 580 980" | Out-Null
Start-Sleep -Seconds 3
adb -s $device shell "input tap 600 1100" | Out-Null
Start-Sleep -Seconds 2
adb -s $device shell "input keyevent KEYCODE_ENTER" | Out-Null
Start-Sleep -Seconds 3

# Aguarda registrar no servidor
Step "Aguardando RustDesk registrar no servidor (15s)"
Start-Sleep -Seconds 15

# ---------- 5) Capturar ID ----------
Step "Lendo RustDesk.toml pra capturar ID"
$tomlContent = adb -s $device shell "run-as com.carriez.flutter_hbb cat app_flutter/RustDesk.toml 2>/dev/null"
$encId = ($tomlContent | Select-String -Pattern "enc_id\s*=\s*'([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value })
Ok "enc_id=$encId"

# O ID numerico aparece na tela do app. Tira screenshot pra user ver
$shotPath = "A:\Sistemas\xibo-mod\tv-$($Ip.Replace('.','-')).png"
adb -s $device shell "screencap -p /sdcard/td-final.png" | Out-Null
adb -s $device pull /sdcard/td-final.png $shotPath | Out-Null
Ok "Screenshot salva em $shotPath"
Start-Process $shotPath

$rdId = Read-Host "Cole o ID RustDesk mostrado na tela (9-10 digitos)"
if (-not $rdId) { Warn "ID nao informado, pulando registro no SaaS"; exit 0 }

# ---------- 6) Enviar pro SaaS ----------
Step "Registrando no SaaS"
$body = @{
  secret = $ProvisionSecret
  mac = $mac
  rustdesk_id = $rdId
  rustdesk_senha = $RustSenha
  nome = $DisplayName
  ip = $Ip
} | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Uri "$SaasUrl/api/admin/inventario/rustdesk" -Method Post -Body $body -ContentType "application/json"
  Ok "SaaS respondeu: $($r | ConvertTo-Json -Compress)"
} catch {
  Warn "Falha ao registrar no SaaS: $_"
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  PROVISIONAMENTO CONCLUIDO" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Display Name : $DisplayName"
Write-Host "  MAC          : $mac"
Write-Host "  IP local     : $Ip"
Write-Host "  RustDesk ID  : $rdId"
Write-Host "  RustDesk pwd : $RustSenha (padrao todas TVs)"
Write-Host "  Screenshot   : $shotPath"
Write-Host ""
Write-Host "  Acesso remoto: abra RustDesk no PC, digite ID e senha"
Write-Host "  Ou abra: rustdesk://connection/new/connect?id=$rdId"
