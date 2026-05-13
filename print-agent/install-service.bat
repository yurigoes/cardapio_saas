@echo off
REM ═══════════════════════════════════════════════════════════
REM   Instala o agente como Tarefa Agendada do Windows.
REM   Sobe sozinho a cada login do usuario E continua rodando
REM   em segundo plano.
REM
REM   ATENCAO: clique com botao direito - "Executar como
REM            administrador" para criar a tarefa global.
REM ═══════════════════════════════════════════════════════════
setlocal
cd /d "%~dp0"

set "TASK_NAME=CardapioPrintAgent"
set "AGENT_DIR=%~dp0"
set "AGENT_SCRIPT=%AGENT_DIR%index.js"
set "RUNNER=%AGENT_DIR%run-hidden.vbs"

echo.
echo  Cardapio Print Agent - Instalar Servico
echo  =======================================
echo.

REM Confere se config existe
if not exist "%AGENT_DIR%config.json" (
  echo [X] config.json nao encontrado.
  echo     Rode setup.bat primeiro.
  pause
  exit /b 1
)

REM Cria um VBS que roda o node oculto (sem janela de console)
> "%RUNNER%" echo Set WshShell = CreateObject("WScript.Shell")
>> "%RUNNER%" echo WshShell.CurrentDirectory = "%AGENT_DIR:\=\\%"
>> "%RUNNER%" echo WshShell.Run "cmd /c node """ ^& "%AGENT_SCRIPT:\=\\%" ^& """ ^>^> agent.log 2^>^&1", 0, False

REM Remove tarefa anterior se existir (silencioso)
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul

REM Cria a tarefa: roda no logon do usuario, oculta
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

REM Inicia agora tambem (sem esperar proximo login)
schtasks /Run /TN "%TASK_NAME%"

echo.
echo  =======================================
echo  Instalado com sucesso!
echo.
echo  O agente roda em segundo plano (sem janela).
echo  Logs vao em: %AGENT_DIR%agent.log
echo.
echo  Comandos uteis:
echo     Verificar:    schtasks /Query /TN "%TASK_NAME%"
echo     Parar:        schtasks /End /TN "%TASK_NAME%"
echo     Iniciar:      schtasks /Run /TN "%TASK_NAME%"
echo     Desinstalar:  uninstall-service.bat
echo  =======================================
echo.
pause
