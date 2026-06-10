# _provisiona-comum.ps1
# Funcoes compartilhadas entre os scripts de provisionamento (retrato e paisagem).
# Nao executar diretamente - eh "dot-sourced" pelos scripts pai.

$ErrorActionPreference = "Stop"

# ---------- Logging ----------
function Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "   ! $msg"  -ForegroundColor Yellow }
function Err([string]$msg)  { Write-Host "   X $msg"  -ForegroundColor Red }

# ---------- ADB ----------
function Conectar-Adb([string]$ip) {
  $device = "${ip}:5555"
  Step "Conectando ao dispositivo $device"
  adb connect $device | Out-Null
  Start-Sleep -Seconds 2
  $state = (adb -s $device get-state 2>$null)
  if ($state -ne "device") { throw "Nao consegui conectar em $device (estado=$state)" }
  Ok "ADB conectado"
  return $device
}

function Obter-Root([string]$device) {
  Step "Solicitando root"
  adb -s $device root | Out-Null
  Start-Sleep -Seconds 3
  # Reconecta apos root (adb root reinicia adbd)
  $host_ = $device.Split(":")[0]
  adb connect "${host_}:5555" | Out-Null
  Start-Sleep -Seconds 2
  $id = adb -s $device shell id 2>$null
  if ($id -match "uid=0") { Ok "Root confirmado"; return $true }
  Warn "Sem root - algumas modificacoes (build.prop, bootanimation) serao ignoradas"
  return $false
}

function Obter-Mac([string]$device) {
  $mac = ""
  foreach ($iface in @("wlan0","eth0","wlan1","ra0","p2p0")) {
    $val = (adb -s $device shell "cat /sys/class/net/$iface/address 2>/dev/null" 2>$null).Trim()
    if ($val -and $val -ne "00:00:00:00:00:00") { $mac = $val.ToUpper(); break }
  }
  if (-not $mac) {
    $ipout = (adb -s $device shell "ip link 2>/dev/null | grep -oE '([0-9a-f]{2}:){5}[0-9a-f]{2}' | head -1").Trim()
    if ($ipout) { $mac = $ipout.ToUpper() }
  }
  if (-not $mac) {
    $mac = "02:00:00:" + ((1..3 | ForEach-Object { "{0:X2}" -f (Get-Random -Min 0 -Max 255) }) -join ":")
    Warn "MAC nao detectado, fake: $mac"
  }
  return $mac
}

function Calc-DisplayName([string]$mac, [string]$prefix = "TD") {
  $semDoisPts = $mac -replace ":",""
  $len = $semDoisPts.Length
  $take = [Math]::Min(4, $len)
  $suffix = if ($take -gt 0) { $semDoisPts.Substring($len - $take) } else { (Get-Random -Min 1000 -Max 9999).ToString() }
  return "$prefix-$suffix"
}

# ---------- Rotacao Tela (RK3229) ----------
function Aplicar-Retrato([string]$device, [bool]$hasRoot, [string]$backupDir) {
  Step "Aplicando modo RETRATO 720x1280"

  # Runtime (efeito imediato, perde em reboot sem build.prop)
  adb -s $device shell wm size 720x1280 | Out-Null
  adb -s $device shell setprop persist.sys.rotation 0 | Out-Null
  adb -s $device shell setprop persist.demo.hdmirotation portrait | Out-Null
  adb -s $device shell setprop persist.demo.hdmirotationlock true | Out-Null

  if (-not $hasRoot) { Warn "Sem root, pulando build.prop"; return }

  $hw = (adb -s $device shell getprop ro.sf.hwrotation).Trim()
  Ok "ro.sf.hwrotation atual: '$hw'"
  if ($hw -eq "270") { Ok "Rotacao ja correta"; return }

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  $bp = "$backupDir\build.prop"
  adb -s $device pull /system/build.prop $bp | Out-Null
  if (-not (Test-Path $bp)) { Err "Nao consegui baixar build.prop"; return }

  $conteudo = Get-Content $bp
  if ($conteudo -match "ro\.sf\.hwrotation=") {
    $conteudo = $conteudo -replace "ro\.sf\.hwrotation=\d+", "ro.sf.hwrotation=270"
  } else {
    $conteudo += "ro.sf.hwrotation=270"
  }
  Set-Content -Path $bp -Value $conteudo -Encoding ASCII

  adb -s $device remount | Out-Null
  Start-Sleep -Seconds 2
  adb -s $device push $bp /system/build.prop | Out-Null
  adb -s $device shell chmod 644 /system/build.prop | Out-Null
  Ok "build.prop atualizado com hwrotation=270"
}

function Aplicar-Paisagem([string]$device, [bool]$hasRoot, [string]$backupDir) {
  Step "Aplicando modo PAISAGEM 1280x720"

  adb -s $device shell wm size 1280x720 | Out-Null
  adb -s $device shell setprop persist.sys.rotation 0 | Out-Null
  adb -s $device shell setprop persist.demo.hdmirotation landscape | Out-Null
  adb -s $device shell setprop persist.demo.hdmirotationlock false | Out-Null

  if (-not $hasRoot) { Warn "Sem root, pulando build.prop"; return }

  $hw = (adb -s $device shell getprop ro.sf.hwrotation).Trim()
  Ok "ro.sf.hwrotation atual: '$hw'"
  if ($hw -eq "0" -or $hw -eq "") { Ok "Rotacao ja correta (0)"; return }

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  $bp = "$backupDir\build.prop"
  adb -s $device pull /system/build.prop $bp | Out-Null
  if (-not (Test-Path $bp)) { Err "Nao consegui baixar build.prop"; return }

  $conteudo = Get-Content $bp
  $conteudo = $conteudo -replace "ro\.sf\.hwrotation=\d+", "ro.sf.hwrotation=0"
  Set-Content -Path $bp -Value $conteudo -Encoding ASCII

  adb -s $device remount | Out-Null
  Start-Sleep -Seconds 2
  adb -s $device push $bp /system/build.prop | Out-Null
  adb -s $device shell chmod 644 /system/build.prop | Out-Null
  Ok "build.prop atualizado com hwrotation=0"
}

# ---------- Boot Animation customizada ----------
# Gera bootanimation.zip com fundo preto + LOGO BRANCA centralizada
function Gerar-BootAnimation([string]$logoPng, [int]$width, [int]$height, [string]$outZip) {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName "System.IO.Compression"
  Add-Type -AssemblyName "System.IO.Compression.FileSystem"

  if (-not (Test-Path $logoPng)) { throw "Logo nao encontrada: $logoPng" }

  $work = Join-Path $env:TEMP "td-bootanim-$(Get-Random)"
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $part = Join-Path $work "part0"
  New-Item -ItemType Directory -Force -Path $part | Out-Null

  # Carrega a logo original
  $logo = [System.Drawing.Image]::FromFile($logoPng)

  # Calcula tamanho proporcional (60% da menor dimensao)
  $maxSide = [Math]::Min($width, $height) * 0.6
  $ratio = $logo.Width / $logo.Height
  if ($ratio -ge 1) {
    $lw = [int]$maxSide; $lh = [int]($maxSide / $ratio)
  } else {
    $lh = [int]$maxSide; $lw = [int]($maxSide * $ratio)
  }
  $cx = [int](($width - $lw) / 2)
  $cy = [int](($height - $lh) / 2)

  # Gera 30 frames com fade in suave (alpha de 50 a 255)
  $totalFrames = 30
  for ($i = 0; $i -lt $totalFrames; $i++) {
    $alpha = [int](50 + (205 * $i / ($totalFrames - 1)))
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Black)

    # Aplica transparencia via ColorMatrix
    $cm = New-Object System.Drawing.Imaging.ColorMatrix
    $cm.Matrix33 = $alpha / 255.0
    $ia = New-Object System.Drawing.Imaging.ImageAttributes
    $ia.SetColorMatrix($cm)

    $rect = New-Object System.Drawing.Rectangle $cx, $cy, $lw, $lh
    $g.DrawImage($logo, $rect, 0, 0, $logo.Width, $logo.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
    $g.Dispose()

    $name = ("{0:D4}.png" -f $i)
    $bmp.Save((Join-Path $part $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
  $logo.Dispose()

  # desc.txt - 30 FPS, primeira parte 1x (fade in), segunda parte loop infinito
  $part2 = Join-Path $work "part1"
  New-Item -ItemType Directory -Force -Path $part2 | Out-Null
  # Frame final estatico repetido
  $ultimoFrame = ("{0:D4}.png" -f ($totalFrames - 1))
  Copy-Item (Join-Path $part $ultimoFrame) (Join-Path $part2 "0000.png")

  # desc.txt: ASCII puro, LF only, SEM BOM (requisito Android)
  $desc = "$width $height 30`np 1 0 part0`np 0 30 part1`n"
  [System.IO.File]::WriteAllBytes((Join-Path $work "desc.txt"), [System.Text.Encoding]::ASCII.GetBytes($desc))

  # Zipa SEM compressao (requisito Android boot animation)
  Empacotar-BootZip -srcDir $work -outZip $outZip
  Remove-Item $work -Recurse -Force
  Ok "Bootanimation gerada: $outZip ($([Math]::Round((Get-Item $outZip).Length/1KB,1)) KB, ${width}x${height})"
}

# Empacota um diretorio como bootanimation.zip "puro" (store-only, SEM extra fields).
# Tenta 7z primeiro (gera zip mais compativel); fallback System.IO.Compression direto.
function Empacotar-BootZip([string]$srcDir, [string]$outZip) {
  if (Test-Path $outZip) { Remove-Item $outZip -Force }

  $sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue)
  if ($sevenZip) {
    Step "Empacotando com 7z (store-only)"
    Push-Location $srcDir
    & 7z a -tzip -mx0 -mcu=on $outZip "*" | Out-Null
    Pop-Location
    if (Test-Path $outZip) { Ok "7z OK"; return }
    Warn "7z falhou, fallback System.IO.Compression"
  }

  Step "Empacotando com System.IO.Compression (streams diretos, sem extra fields)"
  $zip = [System.IO.Compression.ZipFile]::Open($outZip, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($f in Get-ChildItem $srcDir -Recurse -File) {
      $rel = $f.FullName.Substring($srcDir.Length + 1).Replace("\","/")
      $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::NoCompression)
      $src = [System.IO.File]::OpenRead($f.FullName)
      $dst = $entry.Open()
      try { $src.CopyTo($dst) } finally { $dst.Close(); $src.Close() }
    }
  } finally { $zip.Dispose() }
}

# Converte um video (mp4/mov/etc) em bootanimation.zip do Android
# Requer ffmpeg no PATH. FPS configuravel (padrao 24 - mais leve que 30, suaviza com 15).
function Gerar-BootAnimation-DeVideo([string]$videoPath, [int]$width, [int]$height, [int]$fps, [string]$outZip) {
  Add-Type -AssemblyName "System.IO.Compression"
  Add-Type -AssemblyName "System.IO.Compression.FileSystem"

  if (-not (Test-Path $videoPath)) { throw "Video nao encontrado: $videoPath" }
  $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue)
  if (-not $ffmpeg) { throw "ffmpeg nao encontrado no PATH. Instale com: winget install Gyan.FFmpeg" }

  $work = Join-Path $env:TEMP "td-bootanim-$(Get-Random)"
  $part = Join-Path $work "part0"
  New-Item -ItemType Directory -Force -Path $part | Out-Null

  Step "Convertendo video em frames PNG (${width}x${height} @ ${fps}fps)"
  # Redimensiona mantendo proporcao + pad preto pra encher ${width}x${height}
  $vf = "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=$fps"
  $framePattern = Join-Path $part "%04d.png"
  & ffmpeg -y -loglevel error -i $videoPath -vf $vf -vsync 0 $framePattern
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou ao extrair frames" }

  $frameCount = (Get-ChildItem $part -Filter "*.png").Count
  Ok "$frameCount frames extraidos"
  if ($frameCount -eq 0) { throw "Nenhum frame gerado" }

  # desc.txt: roda part0 1x na boot, depois loop em part1 (frame final estatico)
  $part1 = Join-Path $work "part1"
  New-Item -ItemType Directory -Force -Path $part1 | Out-Null
  $ultimo = ("{0:D4}.png" -f $frameCount)
  Copy-Item (Join-Path $part $ultimo) (Join-Path $part1 "0000.png")

  $desc = "$width $height $fps`np 1 0 part0`np 0 60 part1`n"
  [System.IO.File]::WriteAllBytes((Join-Path $work "desc.txt"), [System.Text.Encoding]::ASCII.GetBytes($desc))

  Empacotar-BootZip -srcDir $work -outZip $outZip
  Remove-Item $work -Recurse -Force
  Ok "Bootanimation gerada: $outZip ($([Math]::Round((Get-Item $outZip).Length/1MB,2)) MB)"
}

# Instala BOOT VIDEO nativo do Rockchip RK322x/RK3229.
# Converte MP4 -> MPEG-TS (formato esperado pelo binary) e grava em /data/local/bootanimation.ts
# (caminho que NAO requer /system writable). Props persist.* sobrevivem reboot.
function Instalar-BootVideo([string]$device, [string]$videoPath, [bool]$hasRoot) {
  if (-not $hasRoot) { Warn "Sem root, pulando bootvideo"; return $false }
  if (-not (Test-Path $videoPath)) { Warn "Video nao encontrado: $videoPath"; return $false }

  $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue)
  if (-not $ffmpeg) { Err "ffmpeg nao encontrado no PATH (winget install Gyan.FFmpeg)"; return $false }

  Step "Convertendo $videoPath -> MPEG-TS"
  $tsLocal = "$env:TEMP\boot-anim-$(Get-Random).ts"
  & ffmpeg -y -loglevel error -i $videoPath -c:v copy -bsf:v h264_mp4toannexb -an -f mpegts $tsLocal
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tsLocal)) {
    Warn "Stream copy falhou (codec nao-H264?). Tentando re-encode."
    & ffmpeg -y -loglevel error -i $videoPath -c:v libx264 -preset fast -crf 23 -an -f mpegts $tsLocal
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tsLocal)) { Err "ffmpeg falhou"; return $false }
  }
  Ok "TS gerado: $([Math]::Round((Get-Item $tsLocal).Length/1MB,2)) MB"

  Step "Enviando bootanimation.ts pra /data/local/"
  adb -s $device push $tsLocal /sdcard/bootanim.ts | Out-Null
  adb -s $device shell "su -c 'cp /sdcard/bootanim.ts /data/local/bootanimation.ts && chmod 644 /data/local/bootanimation.ts'" | Out-Null
  adb -s $device shell "rm /sdcard/bootanim.ts" | Out-Null
  Remove-Item $tsLocal -ErrorAction SilentlyContinue

  $checkRaw = adb -s $device shell "su -c 'ls -la /data/local/bootanimation.ts 2>/dev/null'"
  $check = if ($null -ne $checkRaw) { ($checkRaw | Out-String).Trim() } else { "" }
  if (-not $check) { Err "Falha ao gravar /data/local/bootanimation.ts"; return $false }
  Ok "Gravado: $check"

  Step "Ativando props persist.sys.bootvideo.* (showtime=-1 = roda ate launcher desenhar)"
  adb -s $device shell "su -c 'setprop persist.sys.bootvideo.enable true'" | Out-Null
  adb -s $device shell "su -c 'setprop persist.sys.bootvideo.showtime -1'" | Out-Null
  # Persist.* sao gravadas em /data/property/ automaticamente - sobrevivem reboot
  Ok "Props persistidas"

  return $true
}

function Instalar-BootAnimation([string]$device, [string]$zipPath, [bool]$hasRoot) {
  if (-not $hasRoot) { Warn "Sem root, pulando bootanimation"; return }
  Step "Instalando bootanimation no /system/media/"
  adb -s $device push $zipPath /sdcard/bootanimation.zip | Out-Null

  # Tenta 3 estrategias de remount (varia por ROM)
  adb -s $device remount 2>&1 | Out-Null
  adb -s $device shell "su -c 'mount -o remount,rw /system' 2>/dev/null" | Out-Null
  adb -s $device shell "su -c 'mount -o remount,rw /' 2>/dev/null" | Out-Null
  Start-Sleep -Seconds 1

  # Copia via su pra TODOS os caminhos conhecidos (varia por ROM RK3229)
  adb -s $device shell "su -c '
    for D in /system/media /oem/media /data/local /system/customize/resource; do
      mkdir -p `$D 2>/dev/null
      cp /sdcard/bootanimation.zip `$D/bootanimation.zip 2>/dev/null && chmod 644 `$D/bootanimation.zip 2>/dev/null
    done
  '" | Out-Null

  # Verifica se chegou
  $check = (adb -s $device shell "su -c 'ls -la /system/media/bootanimation.zip 2>/dev/null'").Trim()
  if ($check -match "bootanimation.zip") {
    Ok "Bootanimation instalada: $check"
  } else {
    Err "FALHA: nao chegou em /system/media/. Tentando local alternativo /data/local/"
    adb -s $device shell "su -c 'cp /sdcard/bootanimation.zip /data/local/bootanimation.zip && chmod 644 /data/local/bootanimation.zip'" | Out-Null
    $check2 = (adb -s $device shell "su -c 'ls -la /data/local/bootanimation.zip 2>/dev/null'").Trim()
    if ($check2 -match "bootanimation.zip") {
      Warn "Gravada em /data/local/ (algumas ROMs RK aceitam este caminho)"
    } else {
      Err "Bootanimation NAO foi gravada. /system esta read-only mesmo com root."
      Err "Solucao: rodar 'adb -s $device shell `"su -c 'getenforce; mount | grep system'`"' pra ver o motivo"
    }
  }
  adb -s $device shell "rm /sdcard/bootanimation.zip" | Out-Null
}

# ---------- Xibo ----------
function Instalar-Xibo([string]$device, [string]$apk, [string]$cms, [string]$key, [string]$displayName) {
  Step "Instalando Xibo (Three Digital Player)"
  if (-not (Test-Path $apk)) { throw "APK Xibo nao encontrado em $apk" }
  adb -s $device install -r -g $apk | Out-Null
  Ok "Xibo APK instalado"

  Step "Limpando dados antigos do Xibo (pm clear)"
  # Sem isso, o app pode ter criado XML zerado antes da gente gravar
  adb -s $device shell "pm clear uk.org.xibo.client" | Out-Null
  adb -s $device shell "am force-stop uk.org.xibo.client" | Out-Null
  Start-Sleep -Seconds 1

  Step "Pre-configurando CMS no Xibo (SharedPreferences)"
  $prefsXml = @"
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="prefs_cms_address">$cms</string>
    <string name="prefs_server_key">$key</string>
    <string name="prefs_display_name">$displayName</string>
    <string name="prefs_hardware_key"></string>
    <boolean name="prefs_screensaver_enabled" value="false" />
</map>
"@
  $tmp = New-TemporaryFile
  [System.IO.File]::WriteAllBytes($tmp.FullName, [System.Text.Encoding]::UTF8.GetBytes($prefsXml))
  adb -s $device push $tmp.FullName "/sdcard/xibo_prefs.xml" | Out-Null
  Remove-Item $tmp.FullName -ErrorAction SilentlyContinue

  $dstDir  = "/data/data/uk.org.xibo.client/shared_prefs"
  $dstFile = "$dstDir/uk.org.xibo.client_preferences.xml"

  # UID numerico via SU (sem su, stat retorna nome tipo 'u0_a59' que chown nao aceita em alguns kernels)
  $uidLine = cmd /c "adb -s $device shell `"su -c 'stat -c %u:%g /data/data/uk.org.xibo.client' 2>/dev/null`""
  $uidGid = if ($uidLine) { ($uidLine | Out-String).Trim() } else { "" }
  if (-not $uidGid -or $uidGid -notmatch "^\d+:\d+$") {
    # fallback: pega do dir do app via ls
    $lsOut = cmd /c "adb -s $device shell `"su -c 'ls -ldn /data/data/uk.org.xibo.client' 2>/dev/null`""
    if ($lsOut -match "^\S+\s+\d+\s+(\d+)\s+(\d+)") { $uidGid = "$($Matches[1]):$($Matches[2])" }
  }
  if (-not $uidGid) { Warn "Nao consegui descobrir UID:GID do Xibo, usando 10000:10000 (chute)"; $uidGid = "10000:10000" }
  Ok "UID:GID do Xibo: $uidGid"

  # Grava com cp + chown numerico + permissoes + restore SELinux context
  $cmds = @"
mkdir -p $dstDir
cp /sdcard/xibo_prefs.xml $dstFile
chown $uidGid $dstDir
chown $uidGid $dstFile
chmod 771 $dstDir
chmod 660 $dstFile
restorecon -R /data/data/uk.org.xibo.client 2>/dev/null
ls -la $dstFile
"@
  $cmds = $cmds -replace "`r`n", "; " -replace "`n", "; "
  $resultado = cmd /c "adb -s $device shell `"su -c '$cmds'`""
  adb -s $device shell "rm /sdcard/xibo_prefs.xml" | Out-Null

  Ok "Gravacao: $resultado"

  # Verifica que o XML realmente esta la com o conteudo certo
  $verifyOut = cmd /c "adb -s $device shell `"su -c 'cat $dstFile' 2>/dev/null`""
  if ($verifyOut -match [regex]::Escape($cms)) {
    Ok "VERIFICADO: CMS=$cms presente no XML"
  } else {
    Err "FALHA: XML nao contem o CMS esperado. Conteudo lido:"
    Write-Host $verifyOut -ForegroundColor Yellow
  }

  # SO AGORA inicia o app, ja com o XML no lugar
  Step "Iniciando Xibo Player"
  adb -s $device shell "am start -n uk.org.xibo.client/uk.org.xibo.player.Player" | Out-Null
  Ok "Xibo iniciado - deve conectar no CMS automaticamente"
}

# Fixa Xibo como launcher (HOME) padrao e desabilita launchers concorrentes
# Para o popup "qual launcher quero padrao?" toda boot.
function Fixar-XiboComoLauncher([string]$device) {
  Step "Fixando Xibo como launcher (HOME) padrao"
  # Activity HOME do Xibo eh uk.org.xibo.player.Player (verificado via query-activities)
  adb -s $device shell "cmd package set-home-activity uk.org.xibo.client/uk.org.xibo.player.Player" | Out-Null

  # Desabilita launchers OEM conhecidos (so os que existirem - ignora erro silencioso)
  $launchersOem = @(
    "com.droidlogic.mboxlauncher",
    "com.google.android.launcher",
    "com.android.launcher3",
    "com.farproc.wifi.analyzer"
  )
  foreach ($pkg in $launchersOem) {
    # Match EXATO (package:NOME no fim da linha)
    $listOut = cmd /c "adb -s $device shell pm list packages $pkg 2>nul"
    $existsExato = $listOut | Where-Object { $_ -match "^package:$([regex]::Escape($pkg))`$" }
    if ($existsExato) {
      cmd /c "adb -s $device shell pm disable-user --user 0 $pkg >nul 2>nul"
      Ok "Launcher OEM desabilitado: $pkg"
    }
  }
  Ok "Xibo agora eh o unico launcher disponivel"
}

# ---------- Three Launcher (Android) ----------
# Instala o launcher Three Digital com relogio + wifi + botoes (Xibo/RustDesk/Config/Reboot),
# sobe wallpaper customizado e fixa como HOME. Substitui o Fixar-XiboComoLauncher
# pra cenarios onde queremos a tela de home propria (e Xibo eh um botao).
function Instalar-LauncherThree {
  param(
    [string]$device,
    [string]$apk,           # caminho do APK do Three Launcher
    [string]$wallpaper,     # caminho da imagem (PNG/JPG) - opcional
    [ValidateSet("retrato","paisagem","")] [string]$orientacao = "",  # sufixo do arquivo no device
    [switch]$NaoFixarComoHome  # se setado, instala mas nao fixa como HOME
  )
  Step "Instalando Three Launcher"
  if (-not (Test-Path $apk)) {
    Warn "APK do launcher nao encontrado: $apk - pulando"
    return
  }
  adb -s $device install -r -g $apk | Out-Null
  Ok "Launcher APK instalado"

  # Sobe wallpaper se fornecido. Empurra em VARIOS lugares pra garantir:
  # 1. /sdcard (publico, precisa permissao em Android <13 - ja inclui READ_EXTERNAL_STORAGE)
  # 2. files dir externa do app (sem permissao)
  # 3. files dir interna do app (via root, sem permissao - mais confiavel)
  if ($wallpaper -and (Test-Path $wallpaper)) {
    $ext = [System.IO.Path]::GetExtension($wallpaper).ToLower().TrimStart(".")
    if ($ext -notin @("png","jpg","jpeg")) { $ext = "png" }
    $nomeArq = if ($orientacao) { "three_wallpaper-$orientacao.$ext" } else { "three_wallpaper.$ext" }

    # 1. /sdcard publico
    adb -s $device push $wallpaper "/sdcard/$nomeArq" | Out-Null
    Ok "Wallpaper enviado para /sdcard/$nomeArq"

    # 2. External files dir do app (cria se nao existir)
    $extDir = "/sdcard/Android/data/com.threedigital.launcher/files"
    adb -s $device shell "mkdir -p $extDir" | Out-Null
    adb -s $device push $wallpaper "$extDir/$nomeArq" | Out-Null
    Ok "Wallpaper enviado para $extDir/$nomeArq"

    # 3. Internal files dir do app (via root)
    $intDir = "/data/data/com.threedigital.launcher/files"
    adb -s $device shell "su -c 'mkdir -p $intDir && cp $extDir/$nomeArq $intDir/$nomeArq && chmod 644 $intDir/$nomeArq && chown -R `$(stat -c %u:%g /data/data/com.threedigital.launcher) $intDir'" | Out-Null
    Ok "Wallpaper enviado para $intDir/$nomeArq (via root)"

    # Tambem garante permissao runtime (Android >=6, antes do maxSdk 32)
    adb -s $device shell "pm grant com.threedigital.launcher android.permission.READ_EXTERNAL_STORAGE" 2>$null | Out-Null
  } else {
    Warn "Sem wallpaper customizado - launcher vai usar gradient default"
  }

  if (-not $NaoFixarComoHome) {
    adb -s $device shell "cmd package set-home-activity com.threedigital.launcher/.MainActivity" | Out-Null
    # Desabilita launchers OEM e tambem o Xibo (que agora vira app comum aberto pelo botao)
    $launchersOem = @(
      "com.droidlogic.mboxlauncher",
      "com.google.android.launcher",
      "com.android.launcher3",
      "com.farproc.wifi.analyzer"
    )
    foreach ($pkg in $launchersOem) {
      $listOut = cmd /c "adb -s $device shell pm list packages $pkg 2>nul"
      $existsExato = $listOut | Where-Object { $_ -match "^package:$([regex]::Escape($pkg))`$" }
      if ($existsExato) {
        cmd /c "adb -s $device shell pm disable-user --user 0 $pkg >nul 2>nul"
        Ok "Launcher OEM desabilitado: $pkg"
      }
    }
    Ok "Three Launcher fixado como HOME (auto-launch Xibo apos 30s sem toque)"
  }
}

# ---------- RustDesk ----------
# IMPORTANTE: os taps automaticos sao calibrados pra resolucao RETRATO 720x1280.
# Pra paisagem 1280x720 as coords precisam ser remapeadas (TODO).
function Instalar-RustDesk([string]$device, [string]$apk, [string]$server, [string]$key, [string]$senha) {
  Step "Instalando RustDesk"
  if (-not (Test-Path $apk)) { throw "APK RustDesk nao encontrado em $apk" }
  adb -s $device install -r -g $apk | Out-Null
  Ok "RustDesk instalado"

  Step "Primeira inicializacao pra criar diretorios em /data/data"
  adb -s $device shell "am start -n com.carriez.flutter_hbb/.MainActivity" | Out-Null
  Start-Sleep -Seconds 8
  adb -s $device shell "am force-stop com.carriez.flutter_hbb" | Out-Null
  Start-Sleep -Seconds 2

  # ---------- RustDesk2.toml (config persistente) ----------
  Step "Gravando RustDesk2.toml (servidor + key + permissoes)"
  $rd2 = @"
rendezvous_server = '${server}:21116'
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = '$server'
relay-server = '$server'
api-server = ''
key = '$key'
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
  [System.IO.File]::WriteAllBytes($tmp2.FullName, [System.Text.Encoding]::UTF8.GetBytes($rd2))
  adb -s $device push $tmp2.FullName "/sdcard/RustDesk2.toml" | Out-Null
  $dst2 = "/data/data/com.carriez.flutter_hbb/app_flutter/RustDesk2.toml"
  adb -s $device shell "su -c 'mkdir -p /data/data/com.carriez.flutter_hbb/app_flutter; cp /sdcard/RustDesk2.toml $dst2 && chmod 660 $dst2'" | Out-Null
  adb -s $device shell "rm /sdcard/RustDesk2.toml" | Out-Null
  Remove-Item $tmp2.FullName -ErrorAction SilentlyContinue
  Ok "RustDesk2.toml gravado"

  # ---------- RustDesk.toml (senha permanente) ----------
  Step "Gravando RustDesk.toml com senha permanente '$senha'"
  # Pull o template gerado pelo app (com enc_id valido), edita o password, push de volta
  $tomlLocal = "$env:TEMP\rd-toml-$(Get-Random).toml"
  cmd /c "adb -s $device shell `"su -c 'cp /data/data/com.carriez.flutter_hbb/app_flutter/RustDesk.toml /sdcard/rd.toml 2>/dev/null'`""
  cmd /c "adb -s $device pull /sdcard/rd.toml `"$tomlLocal`" >nul 2>nul"
  if ((Test-Path $tomlLocal) -and (Get-Item $tomlLocal).Length -gt 0) {
    $c = Get-Content $tomlLocal -Raw
    $c = $c -replace "password = ''", "password = '$senha'"
    [System.IO.File]::WriteAllText($tomlLocal, $c)
    adb -s $device push $tomlLocal /sdcard/rd.toml | Out-Null
    $dst1 = "/data/data/com.carriez.flutter_hbb/app_flutter/RustDesk.toml"
    adb -s $device shell "su -c 'cp /sdcard/rd.toml $dst1 && chmod 660 $dst1'" | Out-Null
    adb -s $device shell "rm /sdcard/rd.toml" | Out-Null
    Remove-Item $tomlLocal -ErrorAction SilentlyContinue
    Ok "Senha permanente gravada"
  } else {
    Warn "RustDesk.toml ainda nao existe - sera gerada na 1a tentativa de conexao"
  }

  # ---------- Iniciar Servico + permissoes via taps ----------
  Step "Iniciando servico via sequencia automatica de taps (retrato 720x1280)"
  Ativar-RustDeskServicoRetrato -device $device

  # ---------- Configurar 'Iniciar na Inicializacao' ----------
  Step "Habilitando 'Iniciar na Inicializacao' + ignorar otimizacao bateria"
  Habilitar-RustDeskStartOnBoot -device $device

  # ---------- Bloqueia notificacao persistente (foreground service) ----------
  Step "Bloqueando notificacao persistente do RustDesk"
  adb -s $device shell 'su -c "appops set com.carriez.flutter_hbb POST_NOTIFICATION ignore"' | Out-Null
  Ok "Notificacao persistente bloqueada (servico continua rodando em background)"

  Ok "RustDesk pronto - senha permanente '$senha', servico ativo"
}

# Sequencia de taps em RESOLUCAO RETRATO 720x1280 que ativa o servico do RustDesk.
# Faz: tap Compartilhar Tela > Iniciar Servico > SCAM warning > MediaProjection > Acessibilidade
function Ativar-RustDeskServicoRetrato([string]$device) {
  # Abre o app
  adb -s $device shell "am start -n com.carriez.flutter_hbb/.MainActivity" | Out-Null
  Start-Sleep -Seconds 5

  # Tap "Compartilhar Tela" (3a aba do rodape)
  adb -s $device shell "input tap 450 1255" | Out-Null
  Start-Sleep -Seconds 3

  # Tap "Iniciar Servico" (botao azul)
  adb -s $device shell "input tap 163 140" | Out-Null
  Start-Sleep -Seconds 4

  # SCAM warning - "Nao mostrar novamente"
  adb -s $device shell "input tap 75 742" | Out-Null
  Start-Sleep -Seconds 1
  # Espera countdown 2s
  Start-Sleep -Seconds 4
  # "Eu concordo"
  adb -s $device shell "input tap 531 783" | Out-Null
  Start-Sleep -Seconds 4

  # Aviso "Habilitar Captura..." - OK
  adb -s $device shell "input tap 560 696" | Out-Null
  Start-Sleep -Seconds 4

  # MediaProjection - "Nao mostrar novamente" + "INICIAR AGORA"
  adb -s $device shell "input tap 58 641" | Out-Null
  Start-Sleep -Seconds 1
  adb -s $device shell "input tap 625 680" | Out-Null
  Start-Sleep -Seconds 5

  # Toggle "Controle de Entrada"
  adb -s $device shell "input tap 665 414" | Out-Null
  Start-Sleep -Seconds 3
  # "Abrir Configuracoes do Sistema"
  adb -s $device shell "input tap 474 721" | Out-Null
  Start-Sleep -Seconds 4
  # Tap em "RustDesk Input" na lista
  adb -s $device shell "input tap 121 195" | Out-Null
  Start-Sleep -Seconds 3
  # Toggle Desativado -> ON
  adb -s $device shell "input tap 18 80" | Out-Null
  Start-Sleep -Seconds 3
  # Popup "Usar RustDesk Input?" - OK
  adb -s $device shell "input tap 651 751" | Out-Null
  Start-Sleep -Seconds 3
  # Back 2x pra voltar pro RustDesk
  adb -s $device shell "input keyevent KEYCODE_BACK" | Out-Null
  Start-Sleep -Seconds 1
  adb -s $device shell "input keyevent KEYCODE_BACK" | Out-Null
  Start-Sleep -Seconds 2
}

# Sequencia de taps em RESOLUCAO PAISAGEM 1280x720 que ativa o servico do RustDesk.
# Coords mapeadas em sessao com TV BOX-3 RK322x.
# IMPORTANTE: show-scam-warning='N' ja esta no toml, entao o SCAM warning NAO aparece.
# Sequencia pos-toml: Iniciar Servico -> Aviso "Habilitar Captura" OK -> MediaProjection
# "INICIAR AGORA" -> Controle de Entrada -> Configuracoes -> RustDesk Input -> Toggle -> OK
function Ativar-RustDeskServicoPaisagem([string]$device) {
  adb -s $device shell "am start -n com.carriez.flutter_hbb/.MainActivity" | Out-Null
  Start-Sleep -Seconds 6
  # Tab "Compartilhar Tela" (3a do rodape, em paisagem)
  adb -s $device shell "input tap 800 685" | Out-Null
  Start-Sleep -Seconds 4
  # Botao azul "Iniciar Servico"
  adb -s $device shell "input tap 407 165" | Out-Null
  Start-Sleep -Seconds 5
  # Aviso "Habilitar Captura de Tela ira automaticamente inicializar o servico" - botao OK
  adb -s $device shell "input tap 877 427" | Out-Null
  Start-Sleep -Seconds 5
  # MediaProjection do Android: checkbox "Nao mostrar novamente" + "INICIAR AGORA"
  # Coords mapeadas em campo: checkbox x=270 y=360, INICIAR AGORA x=963 y=408
  adb -s $device shell "input tap 270 360" | Out-Null  # checkbox "Nao mostrar de novo"
  Start-Sleep -Seconds 1
  adb -s $device shell "input tap 963 408" | Out-Null  # "INICIAR AGORA"
  Start-Sleep -Seconds 6
  # Toggle Controle de Entrada (y=487 quando card Permissoes nao tem botao Iniciar)
  adb -s $device shell "input tap 1217 487" | Out-Null
  Start-Sleep -Seconds 3
  # "Abrir Configuracoes do Sistema"
  adb -s $device shell "input tap 775 458" | Out-Null
  Start-Sleep -Seconds 4
  # Tab "RustDesk Input" na lista de Acessibilidade
  adb -s $device shell "input tap 190 225" | Out-Null
  Start-Sleep -Seconds 3
  # Toggle Desativado -> ON
  adb -s $device shell "input tap 20 97" | Out-Null
  Start-Sleep -Seconds 3
  # Popup "Usar RustDesk Input?" - OK
  adb -s $device shell "input tap 996 489" | Out-Null
  Start-Sleep -Seconds 3
  # Back 2x volta pro RustDesk
  adb -s $device shell "input keyevent KEYCODE_BACK" | Out-Null
  Start-Sleep -Seconds 1
  adb -s $device shell "input keyevent KEYCODE_BACK" | Out-Null
  Start-Sleep -Seconds 2
}

# PAISAGEM 1280x720: habilita "Iniciar na Inicializacao", desabilita Janela Flutuante,
# ativa Acesso direto por IP. Coords mapeadas em sessao TV BOX-3.
function Habilitar-RustDeskStartOnBoot-Paisagem([string]$device) {
  # Tab Configuracoes (4a no rodape)
  adb -s $device shell "input tap 1119 685" | Out-Null
  Start-Sleep -Seconds 3

  # Scroll pra baixo pra achar Acesso direto por IP + Iniciar na Inicializacao
  adb -s $device shell "input swipe 640 600 640 100" | Out-Null
  Start-Sleep -Seconds 2

  # Tap toggle "Acesso direto por IP" (x ~1005 y ~642 nessa rolagem)
  adb -s $device shell "input tap 1005 642" | Out-Null
  Start-Sleep -Seconds 2

  # Scroll pra baixo
  adb -s $device shell "input swipe 640 600 640 100" | Out-Null
  Start-Sleep -Seconds 2

  # Tap toggle "Janela flutuante" pra DESABILITAR (icone sobreposto na tela do Xibo)
  adb -s $device shell "input tap 1005 204" | Out-Null
  Start-Sleep -Seconds 2

  # Scroll DE VOLTA pra cima pra "Iniciar na Inicializacao"
  adb -s $device shell "input swipe 640 200 640 500" | Out-Null
  Start-Sleep -Seconds 2

  # Tap toggle "Iniciar na Inicializacao"
  adb -s $device shell "input tap 1005 490" | Out-Null
  Start-Sleep -Seconds 3

  # Popup "Complete a acao usando" - tap "Otimizacao de bateria"
  adb -s $device shell "input tap 557 566" | Out-Null
  Start-Sleep -Seconds 1
  # SEMPRE
  adb -s $device shell "input tap 827 685" | Out-Null
  Start-Sleep -Seconds 4

  # Popup "Ignorar otimizacoes de bateria?" - SIM
  adb -s $device shell "input tap 996 410" | Out-Null
  Start-Sleep -Seconds 3
}

# Habilita "Iniciar na Inicializacao" + concede "Ignorar otimizacao de bateria" (RETRATO 720x1280)
function Habilitar-RustDeskStartOnBoot([string]$device) {
  # Aba Configuracoes (4a aba)
  adb -s $device shell "input tap 629 1255" | Out-Null
  Start-Sleep -Seconds 3
  # Scroll pra baixo pra achar "Iniciar na Inicializacao"
  adb -s $device shell "input swipe 360 1000 360 200" | Out-Null
  Start-Sleep -Seconds 2
  # Tap toggle "Iniciar na Inicializacao" (coord depois do scroll)
  adb -s $device shell "input tap 665 621" | Out-Null
  Start-Sleep -Seconds 3
  # Popup "Complete a acao usando" - tap "Otimizacao de bateria"
  adb -s $device shell "input tap 287 1151" | Out-Null
  Start-Sleep -Seconds 1
  # SEMPRE
  adb -s $device shell "input tap 521 1249" | Out-Null
  Start-Sleep -Seconds 4
  # Popup "Ignorar otimizacoes de bateria?" - SIM
  adb -s $device shell "input tap 651 682" | Out-Null
  Start-Sleep -Seconds 3
}

function Capturar-RustDeskId([string]$device, [string]$pngOut) {
  Step "Capturando screenshot pra identificar ID RustDesk"
  adb -s $device shell "screencap -p /sdcard/td-final.png" | Out-Null
  adb -s $device pull /sdcard/td-final.png $pngOut | Out-Null
  adb -s $device shell "rm /sdcard/td-final.png" | Out-Null
  Ok "Screenshot: $pngOut"
  try { Invoke-Item $pngOut } catch { Start-Process "explorer.exe" $pngOut }
  $rdId = Read-Host "Cole o ID RustDesk mostrado na tela (9-10 digitos, ou ENTER pra pular)"
  return $rdId.Trim()
}

function Registrar-NoSaas([string]$saasUrl, [string]$secret, [string]$mac, [string]$rdId, [string]$rdSenha, [string]$nome, [string]$ip, [hashtable]$monitor = $null) {
  if (-not $rdId) { Warn "Sem ID RustDesk, pulando registro no SaaS"; return }
  Step "Registrando no SaaS ($saasUrl)"
  $payload = @{
    secret = $secret; mac = $mac; rustdesk_id = $rdId; rustdesk_senha = $rdSenha; nome = $nome; ip = $ip
  }
  if ($monitor) {
    if ($monitor.resolucao) { $payload.monitor_resolucao = $monitor.resolucao }
    if ($monitor.modelo)    { $payload.monitor_modelo    = $monitor.modelo }
    if ($monitor.serial)    { $payload.monitor_serial    = $monitor.serial }
  }
  $body = $payload | ConvertTo-Json
  try {
    $r = Invoke-RestMethod -Uri "$saasUrl/api/admin/inventario/rustdesk" -Method Post -Body $body -ContentType "application/json"
    Ok "SaaS respondeu: $($r | ConvertTo-Json -Compress)"
  } catch {
    Err "Falha ao registrar no SaaS: $_"
  }
}

# Tenta detectar info do monitor HDMI via sysfs Rockchip.
# Retorna hashtable com: connect, resolucao, modelo, serial (null se nao detectados).
function Detectar-MonitorHDMI([string]$device) {
  $info = @{
    connect   = ""
    resolucao = ""
    modelo    = $null
    serial    = $null
  }
  try {
    $info.connect   = (adb -s $device shell "cat /sys/devices/virtual/display/HDMI/connect 2>/dev/null").Trim()
    $info.resolucao = (adb -s $device shell "cat /sys/devices/virtual/display/HDMI/mode 2>/dev/null").Trim()

    # Tenta extrair fabricante/modelo do EDID (so funciona se monitor responde EDID)
    $debug = adb -s $device shell "cat /sys/devices/virtual/display/HDMI/debug 2>/dev/null"
    if ($debug -match "EDID status:\s*True") {
      # EDID valido - parseia bytes 8-17 (manufacturer + product code)
      $hexLines = ($debug -split "`n" | Select-String -Pattern "^0x").ForEach({ $_.Line })
      $bytes = @()
      foreach ($l in $hexLines) {
        $matches = [regex]::Matches($l, "0x([0-9a-fA-F]{2})")
        foreach ($m in $matches) { $bytes += [Convert]::ToInt32($m.Groups[1].Value, 16) }
      }
      if ($bytes.Count -ge 128) {
        # Manufacturer ID nos bytes 8-9 (3 chars compactados em 5 bits cada)
        $manuRaw = ($bytes[8] -shl 8) -bor $bytes[9]
        $c1 = [char](64 + (($manuRaw -shr 10) -band 0x1F))
        $c2 = [char](64 + (($manuRaw -shr 5)  -band 0x1F))
        $c3 = [char](64 + ($manuRaw -band 0x1F))
        $manu = "$c1$c2$c3"

        # Product code nos bytes 10-11
        $prod = "{0:X4}" -f ($bytes[10] -bor ($bytes[11] -shl 8))

        # Serial nos bytes 12-15
        $serialNum = $bytes[12] -bor ($bytes[13] -shl 8) -bor ($bytes[14] -shl 16) -bor ($bytes[15] -shl 24)

        # Procura strings de monitor name em descritores (bytes 54+, blocos de 18 bytes)
        $monitorName = ""
        for ($off = 54; $off -lt 126; $off += 18) {
          if ($bytes[$off] -eq 0 -and $bytes[$off+1] -eq 0 -and $bytes[$off+3] -eq 0xFC) {
            # Descritor tipo "monitor name"
            $nameBytes = $bytes[($off+5)..($off+17)] | Where-Object { $_ -ge 32 -and $_ -lt 127 }
            $monitorName = -join ($nameBytes | ForEach-Object { [char]$_ })
            $monitorName = $monitorName.Trim()
            break
          }
        }

        $info.modelo = if ($monitorName) { "$manu $monitorName" } else { "$manu-$prod" }
        $info.serial = "$serialNum"
      }
    }
  } catch {
    Warn "Detectar-MonitorHDMI falhou: $_"
  }
  return $info
}

function Resumo([hashtable]$data) {
  Write-Host "`n=================================================" -ForegroundColor Green
  Write-Host "  PROVISIONAMENTO CONCLUIDO" -ForegroundColor Green
  Write-Host "=================================================" -ForegroundColor Green
  $data.GetEnumerator() | ForEach-Object { Write-Host ("  {0,-15}: {1}" -f $_.Key, $_.Value) }
  Write-Host ""
}

# ---------- Helpers de provisionamento seletivo ----------

# Retorna $true se o pacote esta instalado no device.
function Esta-Instalado([string]$device, [string]$pacote) {
  $listOut = cmd /c "adb -s $device shell pm list packages $pacote 2>nul"
  $achou = $listOut | Where-Object { $_ -match "^package:$([regex]::Escape($pacote))`$" }
  return [bool]$achou
}

# Desinstala um pacote silenciosamente (ignora erro se nao existir).
function Desinstalar-Pacote([string]$device, [string]$pacote) {
  if (Esta-Instalado $device $pacote) {
    Step "Removendo $pacote antes de reinstalar"
    cmd /c "adb -s $device uninstall $pacote >nul 2>nul" | Out-Null
    Start-Sleep -Milliseconds 500
    Ok "$pacote removido"
  }
}

# Prompt interativo de selecao de componentes.
# Retorna hashtable com flags: @{ Xibo=$bool; RustDesk=$bool; Launcher=$bool; Boot=$bool }
# Aceita atalhos: 'tudo' (todos + boot animation + rotacao), '1','2','3' (xibo,rustdesk,launcher).
function Selecionar-Componentes {
  Write-Host ""
  Write-Host "  Selecionar o que instalar/reinstalar" -ForegroundColor Cyan
  Write-Host "  -------------------------------------" -ForegroundColor Cyan
  Write-Host "    1 - Xibo (player)"
  Write-Host "    2 - RustDesk (acesso remoto)"
  Write-Host "    3 - Three Launcher (HOME + wallpaper)"
  Write-Host "    T - Tudo (inclui boot animation + rotacao tela)"
  Write-Host ""
  Write-Host "  Digite numeros separados por virgula (ex: 1,3) ou T pra tudo:" -ForegroundColor Yellow
  $resp = (Read-Host "  Opcao").Trim().ToUpper()
  if (-not $resp) { $resp = "T" }

  $flags = @{ Xibo=$false; RustDesk=$false; Launcher=$false; Boot=$false }
  if ($resp -eq "T" -or $resp -eq "TUDO") {
    $flags.Xibo = $true; $flags.RustDesk = $true; $flags.Launcher = $true; $flags.Boot = $true
  } else {
    $partes = $resp -split '[,;\s]+' | Where-Object { $_ }
    foreach ($p in $partes) {
      switch ($p) {
        "1"        { $flags.Xibo = $true }
        "XIBO"     { $flags.Xibo = $true }
        "2"        { $flags.RustDesk = $true }
        "RUSTDESK" { $flags.RustDesk = $true }
        "3"        { $flags.Launcher = $true }
        "LAUNCHER" { $flags.Launcher = $true }
        default    { Warn "Opcao ignorada: $p" }
      }
    }
  }

  if (-not ($flags.Xibo -or $flags.RustDesk -or $flags.Launcher -or $flags.Boot)) {
    Write-Host "  Nada selecionado - abortando." -ForegroundColor Red
    exit 1
  }

  $resumo = @()
  if ($flags.Boot)     { $resumo += "Boot+Rotacao" }
  if ($flags.RustDesk) { $resumo += "RustDesk" }
  if ($flags.Xibo)     { $resumo += "Xibo" }
  if ($flags.Launcher) { $resumo += "Launcher" }
  Write-Host ("  Selecionado: " + ($resumo -join ", ")) -ForegroundColor Green
  Write-Host ""
  return $flags
}

# Converte string CSV em hashtable de flags (uso via -Componentes "xibo,launcher")
function Parse-Componentes([string]$csv) {
  $flags = @{ Xibo=$false; RustDesk=$false; Launcher=$false; Boot=$false }
  $partes = $csv -split '[,;\s]+' | Where-Object { $_ }
  foreach ($p in $partes) {
    switch ($p.ToLower()) {
      "tudo"     { $flags.Xibo = $true; $flags.RustDesk = $true; $flags.Launcher = $true; $flags.Boot = $true }
      "all"      { $flags.Xibo = $true; $flags.RustDesk = $true; $flags.Launcher = $true; $flags.Boot = $true }
      "xibo"     { $flags.Xibo = $true }
      "rustdesk" { $flags.RustDesk = $true }
      "launcher" { $flags.Launcher = $true }
      "boot"     { $flags.Boot = $true }
      default    { Warn "Componente desconhecido: $p" }
    }
  }
  return $flags
}
