# provisiona.ps1
# Wrapper interativo: pergunta orientacao e chama o script certo.
# Uso:
#   .\provisiona.ps1 -Ip 192.168.15.51
#   .\provisiona.ps1 -Ip 192.168.15.51 -DisplayName "TD-LOJA-01"
#   .\provisiona.ps1 -Ip 192.168.15.51 -Orientacao retrato   # pula o menu

param(
  [Parameter(Mandatory=$true)] [string]$Ip,
  [string]$DisplayName = "",
  [ValidateSet("retrato","paisagem","")] [string]$Orientacao = ""
)

if (-not $Orientacao) {
  Write-Host ""
  Write-Host "  Qual orientacao da TV?" -ForegroundColor Cyan
  Write-Host "    [1] Retrato  (em pe / vertical / 720x1280)" -ForegroundColor White
  Write-Host "    [2] Paisagem (deitada / horizontal / 1280x720)" -ForegroundColor White
  Write-Host ""
  do {
    $r = Read-Host "  Escolha (1 ou 2)"
  } while ($r -ne "1" -and $r -ne "2")
  $Orientacao = if ($r -eq "1") { "retrato" } else { "paisagem" }
}

$script = if ($Orientacao -eq "retrato") {
  "$PSScriptRoot\provisiona-retrato.ps1"
} else {
  "$PSScriptRoot\provisiona-paisagem.ps1"
}

Write-Host ""
Write-Host "  >> Rodando: $script" -ForegroundColor Yellow
Write-Host ""

$argsFwd = @{ Ip = $Ip }
if ($DisplayName) { $argsFwd.DisplayName = $DisplayName }

& $script @argsFwd
