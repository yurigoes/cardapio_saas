@echo off
REM ═══════════════════════════════════════════════════════════
REM Cardapio Print Agent - Autostart no LOGON do usuario
REM
REM Coloca um atalho do start-background.bat na pasta Startup
REM do Windows. Vai rodar automaticamente toda vez que o usuario
REM logar (sem precisar de scheduled task ou admin).
REM
REM Limitacao: so roda quando ALGUEM faz login. Se o PC reinicia
REM e ninguem loga, agente nao sobe. Pra cenario "PC sempre ligado
REM e sempre com usuario logado" essa eh a opcao mais simples.
REM
REM Pra cenario "PC sem usuario logado", use install-service.bat
REM (cria tarefa Boot SYSTEM, requer admin).
REM ═══════════════════════════════════════════════════════════
title Cardapio Print Agent - Instalar Autostart
cd /d "%~dp0"

echo.
echo  ============================================
echo  Cardapio Print Agent - Autostart no Logon
echo  ============================================
echo.

REM Pasta Startup do usuario atual
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\CardapioPrintAgent.lnk"
set "TARGET=%~dp0start-background.bat"

if not exist "%TARGET%" (
  echo  [X] start-background.bat nao encontrado em %TARGET%
  echo      Re-baixe o agente do painel.
  pause
  exit /b 1
)

if not exist "%STARTUP%" (
  echo  [X] Pasta Startup nao existe:
  echo      %STARTUP%
  pause
  exit /b 1
)

echo  Criando atalho em:
echo  %LINK%
echo.

REM Cria atalho via PowerShell - tudo em UMA linha (caret do batch nao
REM eh interpretado por PS, entao multi-linha quebra).
REM Aspas duplas no -Command precisam virar simples no PS pra nao conflitar.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%LINK%'); $sc.TargetPath = '%TARGET%'; $sc.WorkingDirectory = '%~dp0'; $sc.WindowStyle = 7; $sc.Description = 'Cardapio Print Agent autostart'; $sc.Save()"

if not exist "%LINK%" (
  echo  [X] Falha ao criar atalho.
  echo      Confirme PowerShell esta funcional: powershell -Command "Write-Host OK"
  pause
  exit /b 1
)

echo  [OK] Atalho criado!
echo.
echo  Pra TESTAR:
echo      1. Fecha esta janela
echo      2. Deslogar / fazer login de novo
echo      3. Agente sobe automaticamente em segundo plano
echo.
echo  Pra REMOVER autostart:
echo      del "%LINK%"
echo.
echo  Iniciando agente AGORA pra teste...
call "%TARGET%"
exit /b 0
