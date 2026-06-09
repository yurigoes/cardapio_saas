# provisiona-paisagem.ps1
# Provisiona TV box em MODO PAISAGEM (1280x720, orientacao normal/original).
# Faz: rotacao zerada + boot animation Three Digital + Xibo + RustDesk + registra SaaS.
#
# Uso:
#   .\provisiona-paisagem.ps1 -Ip 192.168.15.51
#   .\provisiona-paisagem.ps1 -Ip 192.168.15.51 -DisplayName "TD-RECEPCAO-02"

param(
  [Parameter(Mandatory=$true)] [string]$Ip,
  [string]$DisplayName = "",
  [string]$XiboApk = "A:\Sistemas\xibo-mod\xibo-modificado.apk",
  [string]$RustDeskApk = "A:\Sistemas\rustdesk\rustdesk.apk",
  [string]$LogoPng = "A:\Sistemas\LOGO BRANCA.png",
  [string]$BootVideo = "A:\Sistemas\xibo-mod\boot-paisagem.mp4",
  [int]$BootFps = 24,
  [string]$CmsAddress = "https://midia.tthreedigital.com.br",
  [string]$ServerKey = "2IG5P8rP",
  [string]$RustServer = "178.105.111.15",
  [string]$RustKey = "9fjEt0kExiLT6aQmexCiXUddUiU67IlpwV4MlzDPeo0=",
  [string]$RustSenha = "td2026",
  [string]$SaasUrl = "https://midiaindoor.tthreedigital.com.br",
  [string]$ProvisionSecret = "td-provision-2026",
  [switch]$SemReboot
)

. "$PSScriptRoot\_provisiona-comum.ps1"

$dataHora = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "$PSScriptRoot\Backup_$dataHora"
$bootZip   = "$PSScriptRoot\bootanim-paisagem.zip"
$shotPath  = "$PSScriptRoot\tv-$($Ip.Replace('.','-')).png"

# 1. Conexao + root
$device  = Conectar-Adb $Ip
$hasRoot = Obter-Root $device

# 2. Identidade
$mac = Obter-Mac $device
if (-not $DisplayName) { $DisplayName = Calc-DisplayName $mac "TD" }
Ok "MAC=$mac DisplayName=$DisplayName"

# 3. Boot animation: MP4 nativo Rockchip (preferido) ou ZIP fallback
$videoOk = $false
if (Test-Path $BootVideo) {
  $videoOk = Instalar-BootVideo -device $device -videoPath $BootVideo -hasRoot $hasRoot
}
if (-not $videoOk) {
  Warn "Sem video nativo - usando bootanimation.zip com logo estatica"
  Gerar-BootAnimation -logoPng $LogoPng -width 1280 -height 720 -outZip $bootZip
  Instalar-BootAnimation -device $device -zipPath $bootZip -hasRoot $hasRoot
}

# 4. Rotacao paisagem (zerada)
Aplicar-Paisagem -device $device -hasRoot $hasRoot -backupDir $backupDir

# ============ NOVA ORDEM: RustDesk PRIMEIRO, depois Xibo (que sera launcher) ============

# 5. RustDesk - instalar + config + ativar servico + capturar ID
Step "Instalando RustDesk PRIMEIRO (pra capturar ID antes do Xibo virar launcher)"
$rdId = ""
if (Test-Path $RustDeskApk) {
  adb -s $device install -r -g $RustDeskApk | Out-Null
  Ok "RustDesk APK instalado"
  Start-Sleep -Seconds 3
  adb -s $device shell "am start -n com.carriez.flutter_hbb/.MainActivity" | Out-Null
  Start-Sleep -Seconds 8
  adb -s $device shell "am force-stop com.carriez.flutter_hbb" | Out-Null
  Start-Sleep -Seconds 2

  # Grava RustDesk2.toml com TUDO inclusive desabilitar janela flutuante
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
disable-floating-window = 'Y'
show-scam-warning = 'N'
"@
  $tmp2 = New-TemporaryFile
  [System.IO.File]::WriteAllBytes($tmp2.FullName, [System.Text.Encoding]::UTF8.GetBytes($rd2))
  adb -s $device push $tmp2.FullName "/sdcard/RustDesk2.toml" | Out-Null
  adb -s $device shell "su -c 'mkdir -p /data/data/com.carriez.flutter_hbb/app_flutter; cp /sdcard/RustDesk2.toml /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk2.toml && chmod 660 /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk2.toml'" | Out-Null
  Remove-Item $tmp2.FullName -ErrorAction SilentlyContinue
  adb -s $device shell "rm /sdcard/RustDesk2.toml" | Out-Null
  Ok "RustDesk2.toml gravado (com floating window desabilitado)"

  # Senha permanente via toml
  $tomlLocal = "$env:TEMP\rd-paisagem-$(Get-Random).toml"
  cmd /c "adb -s $device shell `"su -c 'cp /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk.toml /sdcard/rd.toml 2>/dev/null'`""
  cmd /c "adb -s $device pull /sdcard/rd.toml `"$tomlLocal`" >nul 2>nul"
  if ((Test-Path $tomlLocal) -and (Get-Item $tomlLocal).Length -gt 0) {
    $c = Get-Content $tomlLocal -Raw
    $c = $c -replace "password = ''", "password = '$RustSenha'"
    [System.IO.File]::WriteAllText($tomlLocal, $c)
    adb -s $device push $tomlLocal /sdcard/rd.toml | Out-Null
    adb -s $device shell "su -c 'cp /sdcard/rd.toml /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk.toml && chmod 660 /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk.toml'" | Out-Null
    adb -s $device shell "rm /sdcard/rd.toml" | Out-Null
    Remove-Item $tomlLocal -ErrorAction SilentlyContinue
    Ok "Senha permanente '$RustSenha' gravada"
  }

  # ATENCAO: o RustDesk pode resetar o toml ao primeiro start.
  # Pra garantir, sobrescreve mais 1x APOS o app ter gerado RustDesk.toml inicial
  Step "Re-gravando RustDesk2.toml pra garantir config (alguns APKs resetam ao primeiro start)"
  $tmp3 = New-TemporaryFile
  [System.IO.File]::WriteAllBytes($tmp3.FullName, [System.Text.Encoding]::UTF8.GetBytes($rd2))
  adb -s $device push $tmp3.FullName "/sdcard/RustDesk2.toml" | Out-Null
  adb -s $device shell "su -c 'cp /sdcard/RustDesk2.toml /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk2.toml'" | Out-Null
  adb -s $device shell "rm /sdcard/RustDesk2.toml" | Out-Null
  Remove-Item $tmp3.FullName -ErrorAction SilentlyContinue
  # Apaga RustDesk.toml pra gerar ID novo associado ao server proprio (nao o publico)
  adb -s $device shell "su -c 'rm /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk.toml 2>/dev/null'" | Out-Null

  # Ativa servico + permissoes via taps PAISAGEM
  Step "Ativando servico RustDesk via taps automaticos (paisagem)"
  Ativar-RustDeskServicoPaisagem -device $device
  Ok "RustDesk servico ativado"

  # Configura: Iniciar na Inicializacao + desabilita Janela flutuante + Acesso direto IP
  Step "Configurando RustDesk: iniciar no boot + ocultar janela flutuante + IP direto"
  Habilitar-RustDeskStartOnBoot-Paisagem -device $device
  Ok "RustDesk vai subir sozinho no boot, sem icone sobreposto"

  # Bloqueia notificacao persistente do RustDesk via appops (foreground service notif)
  Step "Bloqueando notificacao persistente do RustDesk (testado em campo)"
  adb -s $device shell 'su -c "appops set com.carriez.flutter_hbb POST_NOTIFICATION ignore"' | Out-Null
  Ok "Notificacao persistente bloqueada"

  # Captura ID via screenshot - APROVEITA que ainda nao subiu Xibo
  $rdId = Capturar-RustDeskId -device $device -pngOut $shotPath
} else {
  Warn "RustDesk APK nao encontrado em $RustDeskApk"
}

# 6. Detecta monitor HDMI (antes de Xibo cobrir)
$monitor = Detectar-MonitorHDMI -device $device
if ($monitor.connect -eq "1") {
  Ok "Monitor HDMI: $($monitor.resolucao)$(if ($monitor.modelo) { ' - ' + $monitor.modelo } else { ' (modelo manual)' })"
}

# 7. Registra no SaaS (com ID Rustdesk + monitor) ANTES de instalar Xibo
Registrar-NoSaas -saasUrl $SaasUrl -secret $ProvisionSecret -mac $mac -rdId $rdId -rdSenha $RustSenha -nome $DisplayName -ip $Ip -monitor $monitor

# 8. AGORA instala Xibo + pre-config
Step "Instalando Xibo (sera o launcher principal)"
Instalar-Xibo -device $device -apk $XiboApk -cms $CmsAddress -key $ServerKey -displayName $DisplayName

# 9. Fixa Xibo como launcher principal (RustDesk continua rodando em background)
Step "Fixando Xibo como launcher principal"
Fixar-XiboComoLauncher -device $device

# 7. Resumo + reboot
Resumo @{
  Orientacao    = "PAISAGEM 1280x720"
  DisplayName   = $DisplayName
  MAC           = $mac
  IP            = $Ip
  "RustDesk ID" = $rdId
  "RustDesk pwd"= $RustSenha
  Screenshot    = $shotPath
  Backup        = $backupDir
}

if (-not $SemReboot) {
  Write-Host "Reiniciando o device em 5s pra aplicar boot animation + rotacao..." -ForegroundColor Yellow
  Start-Sleep -Seconds 5
  adb -s $device reboot
  Ok "Reboot enviado"
}
