@echo off
REM ═══════════════════════════════════════════════════════════
REM   Instala o agente como Tarefa Agendada do Windows.
REM   Sobe sozinho a cada login, oculto, redireciona logs pra agent.log.
REM
REM   ATENCAO: clique direito - "Executar como administrador"
REM ═══════════════════════════════════════════════════════════
setlocal
cd /d "%~dp0"

set "TASK_NAME=CardapioPrintAgent"
set "RUNNER=%~dp0runner.vbs"

echo.
echo  Cardapio Print Agent - Instalar Servico
echo  =======================================
echo.

if not exist "%~dp0config.json" (
  echo [X] config.json nao encontrado.
  echo     Rode setup.bat primeiro.
  pause
  exit /b 1
)

if not exist "%RUNNER%" (
  echo [X] runner.vbs nao encontrado em %RUNNER%
  echo     Re-baixe o agente do painel - este arquivo esta faltando.
  pause
  exit /b 1
)

REM Remove tarefa anterior
schtasks /End    /TN "%TASK_NAME%" >nul 2>nul
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul

REM Cria a tarefa: roda no logon, oculta via wscript
schtasks /Create /TN "%TASK_NAME%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC ONLOGON ^
  /RL HIGHEST ^
  /F

if errorlevel 1 (
  echo.
  echo [X] Falha ao criar tarefa. Tente executar como Administrador.
  pause
  exit /b 1
)

REM Inicia agora tambem
schtasks /Run /TN "%TASK_NAME%"

REM Da tempo do node iniciar
timeout /t 3 /nobreak >nul

echo.
echo  =======================================
echo  Instalado.
echo.
echo  Verifica se esta rodando:
echo     tasklist ^| findstr node
echo.
echo  Logs em:
echo     %~dp0agent.log
echo.
echo  Comandos:
echo     Status:       schtasks /Query /TN "%TASK_NAME%" /V /FO LIST
echo     Forcar exec:  schtasks /Run /TN "%TASK_NAME%"
echo     Parar:        schtasks /End /TN "%TASK_NAME%"
echo     Desinstalar:  uninstall-service.bat
echo  =======================================
echo.
pause
