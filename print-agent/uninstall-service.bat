@echo off
REM Remove TODAS as tarefas do agente (boot + logon + watchdog).
setlocal
cd /d "%~dp0"

echo.
echo  Cardapio Print Agent - Desinstalar Servico
echo  ==========================================
echo.

REM Para qualquer processo node rodando do agente
echo Parando processos node em execucao...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq CardapioPrintAgent*" 2>nul
taskkill /F /IM wscript.exe /FI "WINDOWTITLE eq runner*" 2>nul

REM Remove tarefas (todas variantes possiveis, antigo+novo)
for %%T in (CardapioPrintAgent CardapioPrintAgent_Boot CardapioPrintAgent_Logon CardapioPrintAgent_Watchdog) do (
  schtasks /End    /TN "%%T" >nul 2>nul
  schtasks /Delete /TN "%%T" /F >nul 2>nul
)

echo.
echo  [OK] Desinstalado.
echo       Agente nao roda mais automaticamente.
echo       Configuracao (config.json) preservada.
echo       Pra reinstalar, rode install-service.bat como admin.
echo.
pause
