@echo off
REM ═══════════════════════════════════════════════════════════
REM   Cardapio Print Agent - Instalador de servico Windows v1.4
REM
REM   Cria 3 tarefas no Agendador do Windows:
REM
REM   1. CardapioPrintAgent_Boot     roda no BOOT (SYSTEM)
REM                                   - sobe sozinho mesmo sem ninguem
REM                                     logado
REM                                   - funciona com impressoras TCP/rede
REM
REM   2. CardapioPrintAgent_Logon    roda no LOGON do usuario
REM                                   - cobre impressoras Windows
REM                                     instaladas no perfil do user
REM
REM   3. CardapioPrintAgent_Watchdog roda a cada 5 min
REM                                   - relanca processo se cair
REM                                   - o runner.vbs detecta dup e nao
REM                                     duplica
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

echo.
echo  ============================================
echo  Cardapio Print Agent - Instalar Servico
echo  ============================================
echo.

REM ── Checa privilegio admin ─────────────────────────
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

REM ── Detecta node.exe (caminho absoluto) ────────────
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

REM ── (Re)gera runner.vbs com caminho ABSOLUTO do node ──
REM
REM Importante: caminho absoluto evita falha quando a tarefa roda
REM no contexto SYSTEM (que tem PATH minimal e nao acha o node).
echo Gerando runner.vbs com caminho absoluto do node...
(
  echo ' Cardapio Print Agent - runner auto-gerado por install-service.bat
  echo ' Caminho absoluto do node: %NODE_EXE%
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
  echo scriptDir = fso.GetParentFolderName^(WScript.ScriptFullName^)
  echo WshShell.CurrentDirectory = scriptDir
  echo.
  echo ' Anti-duplicacao: se ja tem processo com nosso titulo, sai
  echo Set exec = WshShell.Exec^("tasklist /V /FI ""IMAGENAME eq node.exe"" /FO CSV"^)
  echo out = exec.StdOut.ReadAll^(^)
  echo If InStr^(out, "CardapioPrintAgent"^) ^> 0 Then
  echo   WScript.Quit 0
  echo End If
  echo.
  echo ' Inicia o agente com title pra deteccao no proximo watchdog
  echo WshShell.Run "cmd /c title CardapioPrintAgent ^^^& ""%NODE_EXE%"" """ ^& scriptDir ^& "\index.js"" ^>^> agent.log 2^>^&1", 0, False
) > "%RUNNER%"

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

REM ── Cria tarefa BOOT (SYSTEM, no boot do Windows) ──
echo Criando tarefa BOOT (sobe no boot do Windows)...
schtasks /Create /TN "%TASK_BOOT%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC ONSTART ^
  /RU SYSTEM ^
  /RL HIGHEST ^
  /F

if errorlevel 1 (
  echo [X] Falha ao criar tarefa BOOT. Confirma se esta como admin.
  pause
  exit /b 1
)

REM ── Cria tarefa LOGON (no logon de qualquer user) ──
echo Criando tarefa LOGON (sobe no logon do usuario)...
schtasks /Create /TN "%TASK_LOGON%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC ONLOGON ^
  /RL HIGHEST ^
  /F

REM ── Cria tarefa WATCHDOG (relanca a cada 5min) ────
echo Criando tarefa WATCHDOG (relanca processo se cair)...
schtasks /Create /TN "%TASK_WATCH%" ^
  /TR "wscript.exe \"%RUNNER%\"" ^
  /SC MINUTE /MO 5 ^
  /RU SYSTEM ^
  /RL HIGHEST ^
  /F

REM ── Inicia agora ──────────────────────────────────
echo.
echo Iniciando agente agora...
schtasks /Run /TN "%TASK_BOOT%" >nul 2>nul
timeout /t 4 /nobreak >nul

REM ── Verifica se subiu ─────────────────────────────
echo.
echo Verificando se processo esta rodando...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo [!] Processo node nao detectado.
  echo     Confere o arquivo agent.log pra ver o erro:
  echo        type "%LOGFILE%"
) else (
  echo [OK] Processo node rodando!
)

echo.
echo  ============================================
echo  INSTALACAO COMPLETA
echo  ============================================
echo.
echo  Tarefas criadas:
echo     %TASK_BOOT%        no boot do Windows (SYSTEM)
echo     %TASK_LOGON%       no logon do usuario
echo     %TASK_WATCH%       relanca a cada 5min se cair
echo.
echo  Logs:    %LOGFILE%
echo  Status:  schtasks /Query /TN "%TASK_BOOT%" /V /FO LIST
echo  Parar:   uninstall-service.bat (como admin)
echo.
echo  TESTE FINAL:
echo     1. FECHE esta janela (e qualquer cmd)
echo     2. Abra o painel - menu Impressoras
echo     3. Agente deve aparecer ONLINE em ate 60s
echo     4. REINICIE o PC sem fazer login - ainda assim deve estar
echo        ONLINE no painel (gracas a tarefa BOOT)
echo.
echo  ============================================
pause
