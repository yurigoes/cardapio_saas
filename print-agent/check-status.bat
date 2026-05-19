@echo off
REM ═══════════════════════════════════════════════════════════
REM   Cardapio Print Agent - Diagnostico
REM
REM   Mostra status COMPLETO do agente:
REM   - Processo node rodando?
REM   - Tarefas Boot/Logon/Watchdog criadas?
REM   - Caminho do node configurado?
REM   - Ultimas linhas do log
REM
REM   Pra investigar quando "ficou offline" e nao sabe por que.
REM ═══════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  ============================================
echo  Cardapio Print Agent - Diagnostico
echo  ============================================
echo.

REM ── 1. Pasta atual ────────────────────────────────
echo  Pasta do agente: %~dp0
echo.

REM ── 2. node-path.txt ──────────────────────────────
echo  [1] Caminho do node configurado:
if exist "%~dp0node-path.txt" (
  set /p NODE_PATH=<"%~dp0node-path.txt"
  echo      !NODE_PATH!
  if exist "!NODE_PATH!" (
    echo      [OK] arquivo node existe
  ) else (
    echo      [X] caminho do node nao existe no disco
  )
) else (
  echo      [X] node-path.txt NAO existe.
  echo      Rode install-service.bat (como admin) pra criar.
)
echo.

REM ── 3. config.json ───────────────────────────────
echo  [2] config.json:
if exist "%~dp0config.json" (
  echo      [OK] existe
) else (
  echo      [X] NAO existe - rode setup.bat
)
echo.

REM ── 4. runner.vbs ────────────────────────────────
echo  [3] runner.vbs:
if exist "%~dp0runner.vbs" (
  echo      [OK] existe
) else (
  echo      [X] NAO existe - re-baixa o agente
)
echo.

REM ── 5. Tarefas criadas ───────────────────────────
echo  [4] Tarefas no Agendador:
for %%T in (CardapioPrintAgent_Boot CardapioPrintAgent_Logon CardapioPrintAgent_Watchdog) do (
  schtasks /Query /TN "%%T" >nul 2>nul
  if errorlevel 1 (
    echo      [X] %%T NAO criada
  ) else (
    echo      [OK] %%T criada
  )
)
REM Avisa se ainda tem tarefa antiga
schtasks /Query /TN "CardapioPrintAgent" >nul 2>nul
if not errorlevel 1 (
  echo      [!] Tarefa antiga "CardapioPrintAgent" ainda existe.
  echo          Rode uninstall-service.bat + install-service.bat pra limpar.
)
echo.

REM ── 6. Processos rodando ─────────────────────────
echo  [5] Processos rodando:
tasklist /V /FI "IMAGENAME eq node.exe" /FO TABLE 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo      [X] Nenhum processo node.exe encontrado.
  echo          O agente NAO esta rodando.
) else (
  echo      [OK] Processo(s) node.exe encontrado(s):
  for /f "tokens=1,2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH ^| findstr /V "INFO:"') do (
    echo          %%a PID %%b
  )
)
echo.

REM ── 7. Forca executar agora ──────────────────────
echo  [6] Tenta iniciar manualmente via tarefa BOOT:
schtasks /Run /TN "CardapioPrintAgent_Boot" 2>nul
if errorlevel 1 (
  echo      [X] Falha ao executar tarefa BOOT.
) else (
  echo      [OK] Comando enviado. Aguardando 5s...
  timeout /t 5 /nobreak >nul
  tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
  if errorlevel 1 (
    echo      [X] node ainda nao apareceu apos 5s.
  ) else (
    echo      [OK] node detectado apos start manual.
  )
)
echo.

REM ── 8. Ultimas linhas do log ─────────────────────
echo  [7] Ultimas 15 linhas de agent.log:
echo  --------------------------------------------
if exist "%~dp0agent.log" (
  powershell -NoProfile -Command "Get-Content '%~dp0agent.log' -Tail 15 2>$null"
) else (
  echo      (agent.log nao existe ainda)
)
echo  --------------------------------------------
echo.

echo  ============================================
echo  Diagnostico concluido
echo  ============================================
echo.
echo  Comandos uteis:
echo     install-service.bat         reinstala servico (como admin)
echo     uninstall-service.bat       remove servico (como admin)
echo     type agent.log              ve log completo
echo     schtasks /Query /TN "CardapioPrintAgent_Boot" /V /FO LIST
echo                                 detalhes da tarefa BOOT
echo.
pause
