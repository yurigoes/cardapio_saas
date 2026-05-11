# ═══════════════════════════════════════════════════════════════
#  Cardápio SaaS — Build do Slave Agent para Windows
#  Execute: .\build-windows.ps1
#  Gera: dist\cardapio-slave-setup.exe
# ═══════════════════════════════════════════════════════════════
param(
  [string]$Version = "1.0.0",
  [switch]$AllPlatforms
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SlaveDir = $PSScriptRoot
$DistDir  = Join-Path $SlaveDir "dist"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║  Cardápio SaaS — Build Slave .exe   ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Verifica requisitos ──────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "❌ Node.js não encontrado. Instale em: https://nodejs.org" -ForegroundColor Red
  exit 1
}
$NodeVer = (node --version) -replace 'v','' -split '\.' | Select-Object -First 1
if ([int]$NodeVer -lt 18) {
  Write-Host "❌ Node.js 18+ necessário (instalado: v$NodeVer)" -ForegroundColor Red
  exit 1
}

# ── Instala dependências ─────────────────────────────────────────
Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
Set-Location $SlaveDir
npm install --prefer-offline 2>&1 | Select-Object -Last 3

# ── Instala pkg globalmente se não existir ───────────────────────
if (-not (Get-Command pkg -ErrorAction SilentlyContinue)) {
  Write-Host "📦 Instalando pkg..." -ForegroundColor Yellow
  npm install -g pkg 2>&1 | Select-Object -Last 2
}

# ── Cria pasta dist ──────────────────────────────────────────────
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

# ── Atualiza versão no package.json ─────────────────────────────
$pkg = Get-Content "$SlaveDir\package.json" -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content "$SlaveDir\package.json" -Encoding UTF8

# ── Build ────────────────────────────────────────────────────────
Write-Host "⚙️  Gerando executável..." -ForegroundColor Yellow

if ($AllPlatforms) {
  pkg index.js `
    --targets node18-win-x64,node18-linux-x64,node18-macos-x64 `
    --output "$DistDir\cardapio-slave" `
    --compress GZip
  Write-Host "✔ Gerados:" -ForegroundColor Green
  Get-ChildItem $DistDir | ForEach-Object {
    Write-Host "  $($_.Name)  ($([math]::Round($_.Length/1MB,1)) MB)" -ForegroundColor Cyan
  }
} else {
  pkg index.js `
    --targets node18-win-x64 `
    --output "$DistDir\cardapio-slave.exe" `
    --compress GZip

  $ExePath = "$DistDir\cardapio-slave.exe"
  $SizeMB  = [math]::Round((Get-Item $ExePath).Length / 1MB, 1)

  Write-Host ""
  Write-Host "  ✅ Executável gerado!" -ForegroundColor Green
  Write-Host "  📁 $ExePath" -ForegroundColor Cyan
  Write-Host "  📦 Tamanho: $SizeMB MB" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Como usar:" -ForegroundColor Yellow
  Write-Host "  1. Copie 'cardapio-slave.exe' para o computador do restaurante"
  Write-Host "  2. Execute como administrador (duplo clique)"
  Write-Host "  3. O navegador abrirá em http://localhost:7878"
  Write-Host "  4. Siga o assistente de configuração"
  Write-Host ""
  Write-Host "  Para instalar como serviço Windows (iniciar com o sistema):"
  Write-Host "  cardapio-slave.exe --install-service" -ForegroundColor Cyan
  Write-Host ""
}
