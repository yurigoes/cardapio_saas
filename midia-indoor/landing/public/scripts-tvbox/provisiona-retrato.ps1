# provisiona-retrato.ps1
# Provisiona TV box RK3229 em MODO RETRATO (720x1280).
# Faz: rotacao tela + boot animation Three Digital + Xibo + RustDesk + registra SaaS.
#
# Uso:
#   .\provisiona-retrato.ps1 -Ip 192.168.15.51
#   .\provisiona-retrato.ps1 -Ip 192.168.15.51 -DisplayName "TD-LOJA-01"

param(
  [Parameter(Mandatory=$true)] [string]$Ip,
  [string]$DisplayName = "",
  [string]$XiboApk = "A:\Sistemas\xibo-mod\xibo-modificado.apk",
  [string]$RustDeskApk = "A:\Sistemas\rustdesk\rustdesk.apk",
  [string]$LogoPng = "A:\Sistemas\LOGO BRANCA.png",
  [string]$BootVideo = "A:\Sistemas\xibo-mod\boot-retrato.mp4",
  [string]$LauncherApk = "A:\Sistemas\three-launcher\app-release.apk",
  [string]$WallpaperRetrato = "A:\Sistemas\three-launcher\wallpaper-retrato.png",
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
$bootZip   = "$PSScriptRoot\bootanim-retrato.zip"
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
  Gerar-BootAnimation -logoPng $LogoPng -width 720 -height 1280 -outZip $bootZip
  Instalar-BootAnimation -device $device -zipPath $bootZip -hasRoot $hasRoot
}

# 4. Rotacao retrato
Aplicar-Retrato -device $device -hasRoot $hasRoot -backupDir $backupDir

# ============ NOVA ORDEM: RustDesk PRIMEIRO, depois Xibo (que sera launcher) ============

# 5. RustDesk - instalar + config + ativar servico + capturar ID ANTES do Xibo
Instalar-RustDesk -device $device -apk $RustDeskApk -server $RustServer -key $RustKey -senha $RustSenha

# 6. Detecta monitor HDMI (antes do Xibo cobrir)
$monitor = Detectar-MonitorHDMI -device $device
if ($monitor.connect -eq "1") {
  Ok "Monitor HDMI: $($monitor.resolucao)$(if ($monitor.modelo) { ' - ' + $monitor.modelo } else { ' (modelo manual)' })"
}

# 7. Captura ID RustDesk + registra no SaaS
$rdId = Capturar-RustDeskId -device $device -pngOut $shotPath
Registrar-NoSaas -saasUrl $SaasUrl -secret $ProvisionSecret -mac $mac -rdId $rdId -rdSenha $RustSenha -nome $DisplayName -ip $Ip -monitor $monitor

# 8. AGORA instala Xibo + pre-config (NAO mais como launcher — Three Launcher assume HOME)
Instalar-Xibo -device $device -apk $XiboApk -cms $CmsAddress -key $ServerKey -displayName $DisplayName

# 9. Three Launcher: relogio + wifi + botoes + wallpaper retrato. Auto-launch Xibo apos 30s.
Instalar-LauncherThree -device $device -apk $LauncherApk -wallpaper $WallpaperRetrato

# 7. Resumo + reboot
Resumo @{
  Orientacao    = "RETRATO 720x1280"
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
