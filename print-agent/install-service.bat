@echo off
REM ═══════════════════════════════════════════════════════════
REM   Cardapio Print Agent - Instalador de servico v1.7
REM
REM   Cria 2 tarefas no Agendador do Windows (rodam como user atual):
REM   1. CardapioPrintAgent_Logon    no logon do usuario
REM   2. CardapioPrintAgent_Watchdog a cada 5min (relanca se cair)
REM
REM   v1.7: removido /RU SYSTEM (Windows Home/SOHO bloqueia silenciosamente).
REM   Pra cenario "PC sobe sozinho sem ninguem logado", configurar
REM   auto-logon no Windows (netplwiz - desmarcar "exigir senha") +
REM   install-startup.bat.
REM
REM   Tambem grava node-path.txt com caminho absoluto do node (lido
REM   pelo runner.vbs em runtime).
REM
REM   ATENCAO: clique direito - "Executar como administrador"
REM ═══════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "TASK_LOGON=CardapioPrintAgent_Logon"
set "TASK_WATCH=CardapioPrintAgent_Watchdog"
set "RUNNER=%~dp0runner.vbs"
set "LOGFILE=%~dp0agent.log"
set "NODE_PATH_FILE=%~dp0node-path.txt"

echo.
echo  ============================================
echo  Cardapio Print Agent - Instalar Servico
echo  ============================================
echo.

REM ── Checa admin ────────────────────────────────────
net session >nul 2>nul
if errorlevel 1 (
  echo [X] Esse script precisa rodar COMO ADMINISTRADOR.
  echo     Clique direito no arquivo - Executar como administrador.
  pause
  exit /b 1
)

REM ── Checa config.json ──────────────────────────────
if not exist "%~dp0config.json" (
  echo [X] config.json nao encontrado.
  echo     Rode setup.bat primeiro.
  pause
  exit /b 1
)

REM ── Checa runner.vbs ───────────────────────────────
if not exist "%RUNNER%" (
  echo [X] runner.vbs nao encontrado em %RUNNER%
  pause
  exit /b 1
)

REM ── Detecta node.exe ──────────────────────────────
set "NODE_EXE="
for /f "tokens=*" %%i in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%i"
)

if "%NODE_EXE%"=="" (
  echo [X] node.exe nao encontrado no PATH.
  echo     Instale Node.js 18+ em https://nodejs.org/
  pause
  exit /b 1
)

echo  Node.js detectado: %NODE_EXE%
echo  Pasta do agente:  %~dp0
echo.

REM ── Salva caminho do node em node-path.txt ────────
echo Salvando caminho do node em node-path.txt...
> "%NODE_PATH_FILE%" echo %NODE_EXE%

REM ── Remove instalacoes antigas (todas variantes) ──
echo Limpando instalacao anterior...
for %%T in (CardapioPrintAgent CardapioPrintAgent_Boot CardapioPrintAgent_Logon CardapioPrintAgent_Watchdog) do (
  schtasks /End    /TN "%%T" >nul 2>nul
  schtasks /Delete /TN "%%T" /F >nul 2>nul
)

REM ── Cria tarefa LOGON ─────────────────────────────
REM Sem /RU porque queremos como usuario atual (default).
REM /RL HIGHEST: roda elevada se possivel (impressoras Windows do user).
echo Criando tarefa LOGON (sobe no logon do usuario)...
schtasks /Create /TN "%TASK_LOGON%" /TR "wscript.exe \"%RUNNER%\"" /SC ONLOGON /RL HIGHEST /F
if errorlevel 1 (
  echo [X] Falha ao criar tarefa LOGON.
  pause
  exit /b 1
)

REM ── Cria tarefa WATCHDOG (cada 5min) ──────────────
echo Criando tarefa WATCHDOG (relanca cada 5min se cair)...
schtasks /Create /TN "%TASK_WATCH%" /TR "wscript.exe \"%RUNNER%\"" /SC MINUTE /MO 5 /RL HIGHEST /F
if errorlevel 1 (
  echo [!] Watchdog nao criado. Sem retry automatico.
)

REM ── Para qualquer node antigo do agente ──────────
echo Parando processos antigos do agente...
taskkill /F /FI "WINDOWTITLE eq CardapioPrintAgent*" >nul 2>nul

REM ── Inicia agora ──────────────────────────────────
echo.
echo Iniciando agente agora via tarefa LOGON...
schtasks /Run /TN "%TASK_LOGON%" >nul 2>nul
timeout /t 5 /nobreak >nul

REM ── Diagnostico final ─────────────────────────────
echo.
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo [!] Processo node nao detectado. Roda check-status.bat pra diagnostico.
) else (
  echo [OK] Processo node rodando!
)

echo.
echo  ============================================
echo  INSTALACAO COMPLETA
echo  ============================================
echo.
echo  Tarefas criadas:
echo     %TASK_LOGON%       no logon do usuario
echo     %TASK_WATCH%       relanca cada 5min se cair
echo.
echo  Logs:    %LOGFILE%
echo  Status:  check-status.bat
echo  Parar:   uninstall-service.bat (como admin)
echo.
echo  IMPORTANTE:
echo     Como nao usamos /RU SYSTEM (Windows Home bloqueia), o agente
echo     SO sobe quando alguem fizer login no Windows. Pra cenario
echo     "PC fica sempre ligado e sempre com usuario logado" essa
echo     configuracao basta.
echo.
echo     PC sem login automatico: configure auto-logon no Windows
echo     (digite netplwiz no menu Iniciar - desmarcar "exigir senha").
echo.
echo  ============================================
pause
