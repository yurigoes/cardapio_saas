<#
.SYNOPSIS
  Instala RustDesk no Windows apontado pro relay self-hosted da
  Three Digital, com senha permanente fornecida.

.PARAMETER Relay
  Host/IP do relay RustDesk (vem do painel)

.PARAMETER Key
  Chave publica Ed25519 do hbbs (vem do painel)

.PARAMETER Pass
  Senha permanente gerada no painel

.PARAMETER AutoAceite
  Se passado, agente aceita conexao do master sem prompt

.EXAMPLE
  .\install-rustdesk-agent.ps1 -Relay rustdesk.tthreedigital.com.br -Key "..." -Pass "..." -AutoAceite
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$Relay,
  [Parameter(Mandatory = $true)] [string]$Key,
  [Parameter(Mandatory = $true)] [string]$Pass,
  [switch]$AutoAceite,
  [string]$AgentToken = "",
  [string]$ApiBase    = "https://app.tthreedigital.com.br"
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

function Write-Step($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "[!] $msg" -ForegroundColor Red }

# --- 1. Auto-elevate -------------------------------------------------------

function Test-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($current)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Step "Re-executando como Administrador (aceite o UAC)..."
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$($MyInvocation.MyCommand.Path)`"",
               "-Relay", "`"$Relay`"", "-Key", "`"$Key`"", "-Pass", "`"$Pass`"")
  if ($AutoAceite) { $argList += "-AutoAceite" }
  if ($AgentToken) { $argList += "-AgentToken"; $argList += "`"$AgentToken`"" }
  if ($ApiBase)    { $argList += "-ApiBase";    $argList += "`"$ApiBase`"" }
  Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs
  exit 0
}

# --- 2. Download RustDesk --------------------------------------------------

$Installer = Join-Path $env:TEMP "rustdesk-setup.exe"
$Downloaded = $false

$ServerUrl = $env:RUSTDESK_DOWNLOAD_URL
if (-not $ServerUrl) {
  $ServerUrl = "https://app.tthreedigital.com.br/installers/rustdesk-windows.exe"
}

try {
  Write-Step "Baixando RustDesk de $ServerUrl..."
  Invoke-WebRequest -Uri $ServerUrl -OutFile $Installer -UseBasicParsing -TimeoutSec 180
  if ((Get-Item $Installer).Length -ge 5MB) {
    $Downloaded = $true
    Write-Ok ("Download via servidor proprio OK ({0:N1} MB)" -f ((Get-Item $Installer).Length / 1MB))
  }
} catch {
  Write-Step "Servidor proprio indisponivel, tentando GitHub..."
}

if (-not $Downloaded) {
  $RustDeskVer = "1.4.6"
  try {
    $resp = Invoke-RestMethod "https://api.github.com/repos/rustdesk/rustdesk/releases/latest" -TimeoutSec 10
    if ($resp.tag_name) { $RustDeskVer = $resp.tag_name }
  } catch {}
  $RustDeskUrl = "https://github.com/rustdesk/rustdesk/releases/download/$RustDeskVer/rustdesk-$RustDeskVer-x86_64.exe"
  Write-Step "Baixando RustDesk $RustDeskVer do GitHub..."
  try {
    Invoke-WebRequest -Uri $RustDeskUrl -OutFile $Installer -UseBasicParsing -TimeoutSec 180
    Write-Ok ("Download OK ({0:N1} MB)" -f ((Get-Item $Installer).Length / 1MB))
  } catch {
    Write-Err "Falha em ambos os mirrors. Tente baixar manualmente em https://rustdesk.com/download"
    Read-Host "Pressione ENTER pra fechar"
    exit 1
  }
}

# --- 3. Install silenciosamente -------------------------------------------

Write-Step "Instalando RustDesk (silencioso, ~30s)..."
Start-Process -FilePath $Installer -ArgumentList "--silent-install" -Wait -NoNewWindow

$RustDeskExe = "$env:ProgramFiles\RustDesk\rustdesk.exe"
if (-not (Test-Path $RustDeskExe)) {
  $RustDeskExe = "${env:ProgramFiles(x86)}\RustDesk\rustdesk.exe"
}
if (-not (Test-Path $RustDeskExe)) {
  Write-Err "rustdesk.exe nao encontrado apos install"
  Read-Host "Pressione ENTER pra fechar"
  exit 1
}
Write-Ok "Instalado em: $RustDeskExe"

# --- 4. Para servico antes de mexer no config -----------------------------

Stop-Service -Name "RustDesk" -ErrorAction SilentlyContinue
Stop-Process -Name "rustdesk" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# --- 5. Escreve TOML de config (system-wide) ------------------------------

$ConfigDir  = "$env:ProgramData\RustDesk\config"
$ConfigFile = Join-Path $ConfigDir "RustDesk2.toml"
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

$AutoAceiteBlock = ""
if ($AutoAceite) {
  $AutoAceiteBlock = @"

approve-mode = "password"
verification-method = "use-permanent-password"
allow-remote-config-modification = "Y"
"@
}

$Toml = @"
rendezvous_server = "${Relay}:21116"
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = "$Relay"
key = "$Key"
relay-server = "$Relay"
api-server = ""$AutoAceiteBlock
"@

Set-Content -LiteralPath $ConfigFile -Value $Toml -Encoding UTF8
Write-Ok "Config gravado em $ConfigFile"

# --- 6. Define senha permanente -------------------------------------------

Write-Step "Configurando senha permanente..."
& $RustDeskExe --password "$Pass" 2>&1 | Out-Null
Start-Sleep -Seconds 1

# --- 7. Instala como servico (auto-start no boot) -------------------------

Write-Step "Instalando como servico Windows..."
& $RustDeskExe --install-service 2>&1 | Out-Null
Start-Sleep -Seconds 2
Start-Service -Name "RustDesk" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4

# --- 8. Pega ID gerado ----------------------------------------------------

$RustDeskId = $null
try {
  $RustDeskId = & $RustDeskExe --get-id 2>$null | Select-Object -First 1
  if ($RustDeskId) { $RustDeskId = $RustDeskId.Trim() }
} catch {}

# --- 9. Heartbeat scheduled task (se token fornecido) --------------------

if ($AgentToken) {
  Write-Step "Criando scheduled task de heartbeat (1 min)..."
  try {
    # Remove task antigo se houver
    Unregister-ScheduledTask -TaskName "CardapioSaaS-Heartbeat" -Confirm:$false -ErrorAction SilentlyContinue

    $hbScript = @"
`$ErrorActionPreference='SilentlyContinue'
`$body = @{
  hostname   = [Environment]::MachineName
  plataforma = 'windows'
  versao     = 'pdv-windows-1.0'
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri '$ApiBase/api/sync/heartbeat' -Method POST `
  -Headers @{Authorization='Bearer $AgentToken'; 'Content-Type'='application/json'} `
  -Body `$body -TimeoutSec 10 | Out-Null
"@
    $hbPath = "$env:ProgramData\RustDesk\heartbeat.ps1"
    Set-Content -LiteralPath $hbPath -Value $hbScript -Encoding UTF8

    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
      -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$hbPath`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
      -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 365)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

    Register-ScheduledTask -TaskName "CardapioSaaS-Heartbeat" `
      -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null

    Write-Ok "Heartbeat task criada (1 hb a cada 1min). Bate o primeiro agora..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $hbPath
  } catch {
    Write-Err "Falha ao criar scheduled task: $($_.Exception.Message)"
  }
} else {
  Write-Host "  (sem -AgentToken: heartbeat nao configurado, painel ficara em 'Aguardando 1 hb')" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "           RUSTDESK INSTALADO COM SUCESSO" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Relay:  $Relay" -ForegroundColor White
if ($RustDeskId) {
  Write-Host "  ID:     $RustDeskId" -ForegroundColor Yellow
} else {
  Write-Host "  ID:     (rode 'rustdesk --get-id' depois ou abra o cliente)" -ForegroundColor Yellow
}
Write-Host "  Senha:  configurada (a que veio do painel)"
if ($AutoAceite) {
  Write-Host "  Modo:   AUTO-ACEITE - master conecta sem prompt" -ForegroundColor Magenta
} else {
  Write-Host "  Modo:   Confirmacao - maquina pede aceite na 1a conexao"
}
Write-Host ""
Write-Host "PROXIMO PASSO:" -ForegroundColor Cyan
Write-Host "  Volte no painel da Three Digital - Maquinas - Configurar suporte"
Write-Host "  e cole o ID acima no campo 'rustdesk_id'."
Write-Host ""
Read-Host "Pressione ENTER pra fechar"
