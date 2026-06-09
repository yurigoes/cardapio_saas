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

# 5. Apps (Xibo NAO como launcher - assim conseguimos abrir RustDesk e outros apps)
Instalar-Xibo     -device $device -apk $XiboApk     -cms $CmsAddress -key $ServerKey -displayName $DisplayName

# RustDesk: a funcao tem taps automaticos CALIBRADOS PRA RETRATO 720x1280.
# Em paisagem 1280x720, as coordenadas dos botoes sao diferentes - desativado por enquanto.
Warn "RustDesk: taps automaticos sao especificos de retrato. Em paisagem voce precisa"
Warn "abrir o RustDesk manualmente uma vez na primeira TV pra mapear novas coordenadas."
Warn "Instalando APK e gravando config, mas SEM ativar servico automaticamente."

# Instala APK e grava config basica (sem taps)
if (Test-Path $RustDeskApk) {
  adb -s $device install -r -g $RustDeskApk | Out-Null
  Ok "RustDesk APK instalado (servico precisa ser ativado manual)"
} else {
  Warn "RustDesk APK nao encontrado em $RustDeskApk"
}

# 6. Detecta monitor HDMI
$monitor = Detectar-MonitorHDMI -device $device
if ($monitor.connect -eq "1") {
  Ok "Monitor HDMI: $($monitor.resolucao)$(if ($monitor.modelo) { ' - ' + $monitor.modelo } else { ' (modelo manual)' })"
} else {
  Warn "Nenhum monitor HDMI detectado (connect=$($monitor.connect))"
}

# 7. ID RustDesk + SaaS
$rdId = Capturar-RustDeskId -device $device -pngOut $shotPath
Registrar-NoSaas -saasUrl $SaasUrl -secret $ProvisionSecret -mac $mac -rdId $rdId -rdSenha $RustSenha -nome $DisplayName -ip $Ip -monitor $monitor

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
