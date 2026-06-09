# tirar-prints.ps1
# Tira screenshot via ADB de TODAS as TVs cadastradas no inventario do SaaS
# e faz upload de cada print pro endpoint /api/admin/inventario/screenshot.
#
# Pode rodar em loop (-Loop -IntervaloSegundos 300) pra atualizar a cada 5 min.
# Roda no PC do admin (precisa ADB instalado + estar na mesma LAN das TVs).
#
# Uso:
#   .\tirar-prints.ps1                          # 1 vez, todas as TVs
#   .\tirar-prints.ps1 -Ip 192.168.15.51       # so essa TV
#   .\tirar-prints.ps1 -Loop -IntervaloSegundos 300   # atualiza cada 5min

param(
  [string]$SaasUrl = "https://midiaindoor.tthreedigital.com.br",
  [string]$Secret = "td-provision-2026",
  [string]$Ip = "",          # se preenchido, so essa IP
  [switch]$Loop,
  [int]$IntervaloSegundos = 300,
  [switch]$WatchRequests,    # poll fila de requests do admin
  [int]$WatchIntervalSegundos = 15
)

$ErrorActionPreference = "Continue"

function Step([string]$m) { Write-Host ">> $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "   OK $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "   ! $m"  -ForegroundColor Yellow }
function Err([string]$m)  { Write-Host "   X $m"  -ForegroundColor Red }

function Tirar-Print([string]$ip, [string]$mac, [string]$nome) {
  $device = "${ip}:5555"
  Step "[$nome] $device (MAC $mac)"

  # Conecta ADB
  $null = adb connect $device 2>&1
  Start-Sleep -Milliseconds 800
  $state = (adb -s $device get-state 2>$null)
  if ($state -ne "device") {
    Warn "ADB nao conectou (estado=$state) - pulando"
    return
  }

  # Captura tela
  $tmp = "$env:TEMP\td-print-$([guid]::NewGuid().ToString('N')).png"
  & adb -s $device exec-out screencap -p > $tmp 2>$null
  if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -lt 1000) {
    # Fallback via /sdcard
    Remove-Item $tmp -ErrorAction SilentlyContinue
    adb -s $device shell "screencap -p /sdcard/td-shot.png" 2>&1 | Out-Null
    adb -s $device pull /sdcard/td-shot.png $tmp 2>$null | Out-Null
    adb -s $device shell "rm /sdcard/td-shot.png" 2>&1 | Out-Null
    if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -lt 1000) {
      Err "Captura falhou"
      return
    }
  }

  $sizeKb = [Math]::Round((Get-Item $tmp).Length / 1KB, 1)

  # Upload pro SaaS via multipart
  try {
    Add-Type -AssemblyName "System.Net.Http"
    $httpClient = New-Object System.Net.Http.HttpClient
    $content = New-Object System.Net.Http.MultipartFormDataContent
    $content.Add((New-Object System.Net.Http.StringContent($Secret)), "secret")
    $content.Add((New-Object System.Net.Http.StringContent($mac)), "mac")
    $fileBytes = [System.IO.File]::ReadAllBytes($tmp)
    $fileContent = New-Object System.Net.Http.ByteArrayContent(,$fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
    $content.Add($fileContent, "file", "screenshot.png")

    $resp = $httpClient.PostAsync("$SaasUrl/api/admin/inventario/screenshot", $content).Result
    $respText = $resp.Content.ReadAsStringAsync().Result
    if ($resp.IsSuccessStatusCode) {
      Ok "Upload OK ($sizeKb KB)"
    } else {
      Err "Upload falhou: $($resp.StatusCode) - $respText"
    }
    $httpClient.Dispose()
  } catch {
    Err "Erro upload: $_"
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

function Rodar-Uma-Vez() {
  Step "Buscando TVs no SaaS"
  try {
    $r = Invoke-RestMethod -Uri "$SaasUrl/api/admin/inventario/tvs-com-ip?secret=$Secret" -Method Get
    if (-not $r.ok) { Err "SaaS retornou: $($r.error)"; return }
    $tvs = $r.tvs
    if ($Ip) { $tvs = $tvs | Where-Object { $_.ip_local -eq $Ip } }
    Ok "$($tvs.Count) TV(s) pra capturar"
    foreach ($tv in $tvs) {
      Tirar-Print -ip $tv.ip_local -mac $tv.mac -nome $tv.nome
    }
  } catch {
    Err "Erro buscando TVs: $_"
  }
}

function Processar-Fila() {
  try {
    $r = Invoke-RestMethod -Uri "$SaasUrl/api/admin/inventario/screenshot-request?secret=$Secret" -Method Get -TimeoutSec 15
    if (-not $r.ok) { return }
    if ($r.requests.Count -eq 0) { return }
    Step "$($r.requests.Count) request(s) na fila"
    foreach ($req in $r.requests) {
      try {
        Tirar-Print -ip $req.ip -mac $req.mac -nome "request"
        $patchBody = @{ secret = $Secret; id = $req.id; status = "capturado" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$SaasUrl/api/admin/inventario/screenshot-request" -Method Patch -Body $patchBody -ContentType "application/json" -TimeoutSec 15 | Out-Null
      } catch {
        $patchBody = @{ secret = $Secret; id = $req.id; status = "falha"; erro = "$_" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$SaasUrl/api/admin/inventario/screenshot-request" -Method Patch -Body $patchBody -ContentType "application/json" -TimeoutSec 15 | Out-Null
      }
    }
  } catch { Warn "Erro pollando fila: $_" }
}

if ($WatchRequests) {
  Write-Host "`n===== Modo WATCH - poll fila a cada $WatchIntervalSegundos s (Ctrl+C pra parar) =====`n" -ForegroundColor Magenta
  while ($true) {
    Processar-Fila
    Start-Sleep -Seconds $WatchIntervalSegundos
  }
} elseif ($Loop) {
  Write-Host "`n===== Modo LOOP - intervalo $IntervaloSegundos s (Ctrl+C pra parar) =====`n" -ForegroundColor Magenta
  while ($true) {
    Rodar-Uma-Vez
    Write-Host "`n>> Aguardando $IntervaloSegundos s..." -ForegroundColor DarkGray
    Start-Sleep -Seconds $IntervaloSegundos
  }
} else {
  Rodar-Uma-Vez
}
