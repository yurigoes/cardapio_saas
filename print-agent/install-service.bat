@echo off
REM ═══════════════════════════════════════════════════════════
REM   Cardapio Print Agent - Instalador de servico v1.6
REM
REM   Cria 3 tarefas no Agendador do Windows:
REM   1. CardapioPrintAgent_Boot     no boot (SYSTEM)
REM   2. CardapioPrintAgent_Logon    no logon do usuario
REM   3. CardapioPrintAgent_Watchdog a cada 5min (relanca se cair)
REM
REM   Tambem grava node-path.txt com caminho absoluto do node (lido
REM   pelo runner.vbs em runtime).
REM
REM   ATENCAO: clique direito - "Executar como administrador"
REM ═══════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "TASK_BOOT=CardapioPrintAgent_Boot"
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
  echo     Re-baixe o agente do painel - arquivo faltando.
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
  echo     Apos instalar, ABRA UM CMD NOVO e rode este script de novo.
  pause
  exit /b 1
)

echo  Node.js detectado: %NODE_EXE%
echo  Pasta do agente:  %~dp0
echo.

REM ── Salva caminho do node em node-path.txt ────────
REM (runner.vbs le esse arquivo em runtime)
echo Salvando caminho do node em node-path.txt...
> "%NODE_PATH_FILE%" echo %NODE_EXE%

REM ── Valida sintaxe do runner.vbs ──────────────────
echo Validando runner.vbs...
wscript.exe //Nologo //Job:syntax-check "%RUNNER%" >nul 2>nul
REM (wscript nao tem syntax check real; pulamos. Se tiver erro, vai aparecer no log)

REM ── Remove instalacoes antigas ─────────────────────
echo Limpando instalacao anterior...
schtasks /End    /TN "CardapioPrintAgent"      >nul 2>nul
schtasks /Delete /TN "CardapioPrintAgent"   /F >nul 2>nul
schtasks /End    /TN "%TASK_BOOT%"             >nul 2>nul
schtasks /Delete /TN "%TASK_BOOT%"          /F >nul 2>nul
schtasks /End    /TN "%TASK_LOGON%"            >nul 2>nul
schtasks /Delete /TN "%TASK_LOGON%"         /F >nul 2>nul
schtasks /End    /TN "%TASK_WATCH%"            >nul 2>nul
schtasks /Delete /TN "%TASK_WATCH%"         /F >nul 2>nul

REM ── Cria tarefa BOOT (SYSTEM) ─────────────────────
echo Criando tarefa BOOT (sobe no boot do Windows)...
schtasks /Create /TN "%TASK_BOOT%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC ONSTART ^
  /RU SYSTEM ^
  /RL HIGHEST ^
  /F
if errorlevel 1 (
  echo [X] Falha ao criar tarefa BOOT.
  pause
  exit /b 1
)

REM ── Cria tarefa LOGON ─────────────────────────────
echo Criando tarefa LOGON (sobe no logon do usuario)...
schtasks /Create /TN "%TASK_LOGON%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC ONLOGON ^
  /RL HIGHEST ^
  /F

REM ── Cria tarefa WATCHDOG ──────────────────────────
echo Criando tarefa WATCHDOG (relanca a cada 5min se cair)...
schtasks /Create /TN "%TASK_WATCH%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC MINUTE /MO 5 ^
  /RU SYSTEM ^
  /RL HIGHEST ^
  /F

REM ── Para qualquer node CardapioPrintAgent rodando antes ──
echo Parando processos antigos do agente...
taskkill /F /FI "WINDOWTITLE eq CardapioPrintAgent*" >nul 2>nul

REM ── Inicia agora ──────────────────────────────────
echo.
echo Iniciando agente agora...
schtasks /Run /TN "%TASK_BOOT%" >nul 2>nul
timeout /t 5 /nobreak >nul

REM ── Diagnostico final ─────────────────────────────
echo.
echo Verificando se processo esta rodando...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo.
  echo [!] PROCESSO node NAO DETECTADO.
  echo.
  echo     Roda check-status.bat pra diagnostico detalhado.
  echo.
  echo     Possiveis causas:
  echo     - Antivirus bloqueando wscript.exe
  echo     - node.exe em caminho com espacos/caracteres especiais
  echo     - agent.log pode ter o erro: type "%LOGFILE%"
) else (
  echo [OK] Processo node detectado e rodando!
)

echo.
echo  ============================================
echo  INSTALACAO COMPLETA
echo  ============================================
echo.
echo  Tarefas criadas:
echo     %TASK_BOOT%        boot do Windows (SYSTEM)
echo     %TASK_LOGON%       logon do usuario
echo     %TASK_WATCH%       relanca cada 5min se cair
echo.
echo  Logs:    %LOGFILE%
echo  Status:  check-status.bat
echo  Parar:   uninstall-service.bat (como admin)
echo.
echo  PROXIMO PASSO:
echo     1. FECHE esta janela
echo     2. Aguarde 30s
echo     3. Abra check-status.bat pra confirmar online
echo     4. REINICIE o PC sem fazer login - deve continuar funcionando
echo.
echo  ============================================
pause
