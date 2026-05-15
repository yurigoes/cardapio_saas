<#
.SYNOPSIS
  Instala RustDesk no Windows já apontado pro relay self-hosted da
  Three Digital + senha permanente fornecida.

.DESCRIPTION
  - Auto-eleva pra admin (UAC) se não estiver
  - Baixa instalador oficial RustDesk x64 (.exe)
  - Instala silenciosamente
  - Configura relay + key + senha permanente
  - Habilita serviço pra subir no boot
  - Mostra ID gerado pra colar no painel da Three Digital

.PARAMETER Relay
  Host/IP do relay RustDesk (vem do painel)

.PARAMETER Key
  Chave pública Ed25519 do hbbs (vem do painel)

.PARAMETER Pass
  Senha permanente gerada no painel (mostrada uma vez)

.PARAMETER AutoAceite
  Se passado, agente aceita conexão do master sem prompt

.EXAMPLE
  PS C:\> .\install-rustdesk-agent.ps1 -Relay 1.2.3.4 -Key "AAAA...=" -Pass "abc123XYZ"

.EXAMPLE  Via one-liner pelo browser:
  PS C:\> iwr https://app.tthreedigital.com.br/install-agent.ps1 | iex; Install-RustDeskAgent -Relay ... -Key ... -Pass ...
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$Relay,
  [Parameter(Mandatory = $true)] [string]$Key,
  [Parameter(Mandatory = $true)] [string]$Pass,
  [switch]$AutoAceite
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

function Write-Step($msg) { Write-Host "→ $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "✖ $msg" -ForegroundColor Red }

# ─── 1. Auto-elevate ─────────────────────────────────────────────────────────
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
  Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs
  exit 0
}

# ─── 2. Download RustDesk ────────────────────────────────────────────────────
$RustDeskVer = "1.3.0"
$RustDeskUrl = "https://github.com/rustdesk/rustdesk/releases/download/$RustDeskVer/rustdesk-$RustDeskVer-x86_64.exe"
$Installer   = Join-Path $env:TEMP "rustdesk-setup.exe"

if (-not (Test-Path $Installer) -or (Get-Item $Installer).Length -lt 1MB) {
  Write-Step "Baixando RustDesk $RustDeskVer..."
  Invoke-WebRequest -Uri $RustDeskUrl -OutFile $Installer -UseBasicParsing
  Write-Ok "Download concluído ($([math]::Round((Get-Item $Installer).Length / 1MB, 1)) MB)"
} else {
  Write-Step "Usando installer já em cache"
}

# ─── 3. Install silenciosamente ──────────────────────────────────────────────
Write-Step "Instalando RustDesk (silencioso, ~30s)..."
Start-Process -FilePath $Installer -ArgumentList "--silent-install" -Wait -NoNewWindow

$RustDeskExe = "$env:ProgramFiles\RustDesk\rustdesk.exe"
if (-not (Test-Path $RustDeskExe)) {
  $RustDeskExe = "${env:ProgramFiles(x86)}\RustDesk\rustdesk.exe"
}
if (-not (Test-Path $RustDeskExe)) {
  Write-Err "rustdesk.exe não encontrado após install"
  exit 1
}
Write-Ok "Instalado em: $RustDeskExe"

# ─── 4. Para serviço antes de mexer no config ────────────────────────────────
Stop-Service -Name "RustDesk" -ErrorAction SilentlyContinue
Stop-Process -Name "rustdesk" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# ─── 5. Escreve TOML de config (system-wide) ─────────────────────────────────
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

# ─── 6. Define senha permanente ──────────────────────────────────────────────
Write-Step "Configurando senha permanente..."
& $RustDeskExe --password "$Pass" 2>&1 | Out-Null
Start-Sleep -Seconds 1

# ─── 7. Instala como serviço (auto-start no boot) ────────────────────────────
Write-Step "Instalando como serviço Windows..."
& $RustDeskExe --install-service 2>&1 | Out-Null
Start-Sleep -Seconds 2
Start-Service -Name "RustDesk" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4

# ─── 8. Pega ID gerado ───────────────────────────────────────────────────────
$RustDeskId = $null
try {
  $RustDeskId = & $RustDeskExe --get-id 2>$null | Select-Object -First 1
  $RustDeskId = $RustDeskId.Trim()
} catch {}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          RUSTDESK INSTALADO COM SUCESSO                  ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Relay:  $Relay" -ForegroundColor White
if ($RustDeskId) {
  Write-Host "  ID:     $RustDeskId" -ForegroundColor Yellow
} else {
  Write-Host "  ID:     (rode 'rustdesk --get-id' depois ou abra o cliente)" -ForegroundColor Yellow
}
Write-Host "  Senha:  configurada (a que veio do painel)"
if ($AutoAceite) {
  Write-Host "  Modo:   AUTO-ACEITE — master conecta sem prompt" -ForegroundColor Magenta
} else {
  Write-Host "  Modo:   Confirmação — máquina pede aceite na 1ª conexão"
}
Write-Host ""
Write-Host "PRÓXIMO PASSO:" -ForegroundColor Cyan
Write-Host "  Volte no painel da Three Digital → Máquinas → Configurar suporte"
Write-Host "  e cole o ID acima no campo 'rustdesk_id'."
Write-Host ""
Read-Host "Pressione ENTER pra fechar"
