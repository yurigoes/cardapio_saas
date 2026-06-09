# sync-para-saas.ps1
# Copia os scripts de provisionamento atualizados pra dentro do SaaS
# (public/scripts-tvbox/) e regera o zip baixavel.
# Rode sempre que alterar algum *.ps1.

$ErrorActionPreference = "Stop"
$src = "A:\Sistemas\xibo-mod"
$dst = "A:\Sistemas\cardapio_saas\midia-indoor\landing\public\scripts-tvbox"
$zip = "A:\Sistemas\cardapio_saas\midia-indoor\landing\public\scripts-tvbox.zip"

Write-Host ">> Sincronizando scripts pra $dst" -ForegroundColor Cyan
$arquivos = @("_provisiona-comum.ps1", "provisiona.ps1", "provisiona-retrato.ps1", "provisiona-paisagem.ps1")
foreach ($f in $arquivos) {
  Copy-Item "$src\$f" "$dst\$f" -Force
  Write-Host "   OK $f" -ForegroundColor Green
}

Write-Host ">> Regerando $zip" -ForegroundColor Cyan
if (Test-Path $zip) { Remove-Item $zip -Force }
Push-Location $dst
Compress-Archive -Path * -DestinationPath $zip -Force
Pop-Location
Write-Host "   OK zip atualizado ($([Math]::Round((Get-Item $zip).Length/1KB,1)) KB)" -ForegroundColor Green

Write-Host "`n>> Faca git commit + push pra disponibilizar no site." -ForegroundColor Yellow
Write-Host "   cd A:\Sistemas\cardapio_saas; git add -A; git commit -m 'chore(scripts): sync'; git push" -ForegroundColor White
