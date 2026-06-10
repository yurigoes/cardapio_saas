# provisiona-retrato.ps1
# Provisiona TV box RK3229 em MODO RETRATO (720x1280).
# Suporta provisionamento seletivo (so o que precisa) - se chamar sem
# -Componentes, abre prompt interativo. Se passar -Componentes "xibo,launcher"
# roda so esses. Use 'tudo' pra fazer o ciclo completo (boot + rotacao + tudo).
#
# Uso:
#   .\provisiona-retrato.ps1 -Ip 192.168.15.51                          # prompt interativo
#   .\provisiona-retrato.ps1 -Ip 192.168.15.51 -Componentes "tudo"      # tudo do zero
#   .\provisiona-retrato.ps1 -Ip 192.168.15.51 -Componentes "launcher"  # so launcher
#   .\provisiona-retrato.ps1 -Ip 192.168.15.51 -Componentes "xibo,rustdesk"

param(
  [Parameter(Mandatory=$true)] [string]$Ip,
  [string]$DisplayName = "",
  [string]$Componentes = "",   # csv: xibo,rustdesk,launcher,boot OU "tudo". Vazio = prompt.
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

# 1. Conexao + root (SEMPRE)
$device  = Conectar-Adb $Ip
$hasRoot = Obter-Root $device

# 2. Identidade (SEMPRE - leve)
$mac = Obter-Mac $device
if (-not $DisplayName) { $DisplayName = Calc-DisplayName $mac "TD" }
Ok "MAC=$mac DisplayName=$DisplayName"

# 3. Decide quais componentes processar
$flags = if ($Componentes) { Parse-Componentes $Componentes } else { Selecionar-Componentes }

# 4. Boot animation + rotacao (so se -Componentes incluir 'boot' ou 'tudo')
if ($flags.Boot) {
  $videoOk = $false
  if (Test-Path $BootVideo) {
    $videoOk = Instalar-BootVideo -device $device -videoPath $BootVideo -hasRoot $hasRoot
  }
  if (-not $videoOk) {
    Warn "Sem video nativo - usando bootanimation.zip com logo estatica"
    Gerar-BootAnimation -logoPng $LogoPng -width 720 -height 1280 -outZip $bootZip
    Instalar-BootAnimation -device $device -zipPath $bootZip -hasRoot $hasRoot
  }
  Aplicar-Retrato -device $device -hasRoot $hasRoot -backupDir $backupDir
} else {
  Step "Pulando boot animation + rotacao (nao incluido em -Componentes)"
}

# 5. RustDesk - sempre desinstala + reinstala se selecionado
$rdId = $null
if ($flags.RustDesk) {
  Desinstalar-Pacote $device "com.carriez.flutter_hbb"
  Instalar-RustDesk -device $device -apk $RustDeskApk -server $RustServer -key $RustKey -senha $RustSenha

  # 6. Detecta monitor HDMI (antes do Xibo cobrir)
  $monitor = Detectar-MonitorHDMI -device $device
  if ($monitor.connect -eq "1") {
    Ok "Monitor HDMI: $($monitor.resolucao)$(if ($monitor.modelo) { ' - ' + $monitor.modelo } else { ' (modelo manual)' })"
  }

  # 7. Captura ID RustDesk + registra no SaaS
  $rdId = Capturar-RustDeskId -device $device -pngOut $shotPath
  Registrar-NoSaas -saasUrl $SaasUrl -secret $ProvisionSecret -mac $mac -rdId $rdId -rdSenha $RustSenha -nome $DisplayName -ip $Ip -monitor $monitor
} else {
  Step "Pulando RustDesk (nao selecionado)"
}

# 8. Xibo - desinstala + reinstala se selecionado
if ($flags.Xibo) {
  Desinstalar-Pacote $device "uk.org.xibo.client"
  Instalar-Xibo -device $device -apk $XiboApk -cms $CmsAddress -key $ServerKey -displayName $DisplayName
} else {
  Step "Pulando Xibo (nao selecionado)"
}

# 9. Three Launcher: relogio + wifi + botoes + wallpaper retrato. Auto-launch Xibo apos 30s.
if ($flags.Launcher) {
  Desinstalar-Pacote $device "com.threedigital.launcher"
  Instalar-LauncherThree -device $device -apk $LauncherApk -wallpaper $WallpaperRetrato -orientacao "retrato"
} else {
  Step "Pulando Three Launcher (nao selecionado)"
}

# 10. Resumo + reboot
$resumoData = @{
  Orientacao    = "RETRATO 720x1280"
  DisplayName   = $DisplayName
  MAC           = $mac
  IP            = $Ip
}
if ($rdId)        { $resumoData."RustDesk ID" = $rdId; $resumoData."RustDesk pwd" = $RustSenha }
if ($flags.Boot)  { $resumoData.Screenshot = $shotPath; $resumoData.Backup = $backupDir }
$resumoData.Componentes = (@(
  if ($flags.Boot)     { "boot" }
  if ($flags.RustDesk) { "rustdesk" }
  if ($flags.Xibo)     { "xibo" }
  if ($flags.Launcher) { "launcher" }
) -join ", ")
Resumo $resumoData

if (-not $SemReboot) {
  Write-Host "Reiniciando o device em 5s pra aplicar mudancas..." -ForegroundColor Yellow
  Start-Sleep -Seconds 5
  adb -s $device reboot
  Ok "Reboot enviado"
}
