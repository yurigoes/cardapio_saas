@echo off
REM Roda os testes unitarios (Vitest) sem passar pelo npm.ps1 (que esta quebrado
REM neste PowerShell) e sem abrir varias janelas (--pool=threads).
REM Gera test-results.json, lido pela pagina /testes.
cd /d "%~dp0"
echo Rodando testes...
node node_modules\vitest\vitest.mjs run --pool=threads --reporter=default --reporter=json --outputFile=test-results.json
echo.
echo ===========================================================
echo Resultado salvo em test-results.json
echo Abra a pagina /testes no app (npm.cmd run dev) para visualizar.
echo ===========================================================
pause
