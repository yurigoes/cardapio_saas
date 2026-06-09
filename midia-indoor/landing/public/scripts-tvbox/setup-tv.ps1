# setup-tv.ps1
# Provisiona uma TV box nova de forma 100% automática.
#
# USO:
#   .\setup-tv.ps1 -ip 192.168.15.51
#   .\setup-tv.ps1 -ip 192.168.15.51 -nome "Atacadão Ponta 3"
#
# O que faz:
#   1) Conecta via ADB
#   2) Desinstala Xibo se existir
#   3) Instala APK modificado com permissões já aceitas (-g)
#   4) Pré-popula CMS Address + Key + Display Name único
#   5) Reinicia o app
#   6) Mostra o código que apareceu na TV pra ativar no SaaS
#
# DEPENDÊNCIAS: adb no PATH, APK em A:\Sistemas\xibo-mod\xibo-modificado.apk

param(
    [Parameter(Mandatory=$true)][string]$ip,
    [string]$nome = ""
)

$APK = "A:\Sistemas\xibo-mod\xibo-modificado.apk"
$CMS = "https://midia.tthreedigital.com.br"
$KEY = "2IG5P8rP"
$PKG = "uk.org.xibo.client"

# Gera nome único se não passado
if (-not $nome) {
    $sufixo = -join ((48..57) + (65..90) | Get-Random -Count 4 | ForEach-Object {[char]$_})
    $nome = "TD-$sufixo"
}

Write-Host "`n🔧 Provisionando TV em $ip..." -ForegroundColor Cyan
Write-Host "   Nome: $nome`n" -ForegroundColor Yellow

# 1) Conecta
adb connect "${ip}:5555" | Out-Null
Start-Sleep -Seconds 2

$status = (adb -s "${ip}:5555" get-state 2>$null)
if ($status -ne "device") {
    Write-Host "❌ Não conectou. Verifique IP e se ADB via rede está ativo." -ForegroundColor Red
    exit 1
}

# 2) Desinstala
Write-Host "  → desinstalando versão anterior..." -ForegroundColor Gray
adb -s "${ip}:5555" uninstall $PKG 2>$null | Out-Null

# 3) Instala com permissões liberadas
Write-Host "  → instalando APK com permissões aceitas..." -ForegroundColor Gray
$out = adb -s "${ip}:5555" install -g $APK 2>&1
if ($out -notmatch "Success") {
    Write-Host "❌ Falha no install: $out" -ForegroundColor Red
    exit 1
}

# 4) Pré-popula prefs (CMS + Key + Nome)
Write-Host "  → pré-configurando CMS + display name..." -ForegroundColor Gray
$prefs = @"
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="serverAddress">$CMS</string>
    <string name="serverKey">$KEY</string>
    <string name="displayName">$nome</string>
    <boolean name="forceHttps" value="true" />
    <boolean name="startOnBoot" value="true" />
    <string name="collectInterval">60</string>
    <string name="displayTimeZone">America/Sao_Paulo</string>
    <string name="aggregationLevel">Individual</string>
    <boolean name="statsEnabled" value="true" />
</map>
"@
$prefs | Out-File -FilePath "$env:TEMP\xibo_prefs.xml" -Encoding UTF8 -NoNewline

# Pega UID do app
$uid = (adb -s "${ip}:5555" shell stat -c "%u" /data/data/$PKG 2>$null).Trim()
$gid = (adb -s "${ip}:5555" shell stat -c "%g" /data/data/$PKG 2>$null).Trim()

# Push + cp como root
adb -s "${ip}:5555" push "$env:TEMP\xibo_prefs.xml" /sdcard/xibo_prefs.xml | Out-Null
$cmd = "mkdir -p /data/data/$PKG/shared_prefs && cp /sdcard/xibo_prefs.xml /data/data/$PKG/shared_prefs/${PKG}_preferences.xml && chown ${uid}:${gid} /data/data/$PKG/shared_prefs/${PKG}_preferences.xml && chmod 660 /data/data/$PKG/shared_prefs/${PKG}_preferences.xml && rm /sdcard/xibo_prefs.xml"
adb -s "${ip}:5555" shell "su -c '$cmd'" | Out-Null

# 5) Reinicia o app
Write-Host "  → iniciando o app..." -ForegroundColor Gray
adb -s "${ip}:5555" shell am force-stop $PKG | Out-Null
adb -s "${ip}:5555" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 | Out-Null

Start-Sleep -Seconds 8

Write-Host "`n✅ Provisionado!" -ForegroundColor Green
Write-Host "   Nome no Xibo: $nome" -ForegroundColor Yellow
Write-Host "`n📱 Olhe a TV — o código de ativação deve estar visível agora."
Write-Host "   Vá no SaaS: Locais → escolhe o local → Ativar TV por código`n"
