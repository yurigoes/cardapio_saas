@echo off
REM ═══════════════════════════════════════════════════════════
REM Cardapio Print Agent - Diagnostico (v1.6.1)
REM Script defensivo - nunca crasha, sempre pausa no fim.
REM ═══════════════════════════════════════════════════════════
title Cardapio Print Agent - Diagnostico
cd /d "%~dp0"

echo.
echo  ============================================
echo  Cardapio Print Agent - Diagnostico
echo  ============================================
echo.
echo  Pasta: %~dp0
echo.

REM ── [1] node-path.txt ──────────────────────────────
echo  [1] Caminho do node configurado:
if exist "%~dp0node-path.txt" (
  type "%~dp0node-path.txt" 2>nul
  echo.
) else (
  echo      [X] node-path.txt NAO existe.
  echo      Rode install-service.bat como admin.
)
echo.

REM ── [2] node funciona ─────────────────────────────
echo  [2] node.exe no PATH:
where node 2>nul
if errorlevel 1 (
  echo      [X] node.exe NAO encontrado no PATH.
  echo      Instala Node.js em https://nodejs.org/
) else (
  node --version 2>nul
)
echo.

REM ── [3] Arquivos essenciais ───────────────────────
echo  [3] Arquivos essenciais:
if exist "%~dp0config.json"   (echo      [OK] config.json) else (echo      [X] config.json FALTANDO - rode setup.bat)
if exist "%~dp0runner.vbs"    (echo      [OK] runner.vbs)  else (echo      [X] runner.vbs FALTANDO - re-baixe o agente)
if exist "%~dp0index.js"      (echo      [OK] index.js)    else (echo      [X] index.js FALTANDO - re-baixe o agente)
echo.

REM ── [4] Tarefas no Agendador ──────────────────────
echo  [4] Tarefas no Agendador do Windows:
schtasks /Query /TN "CardapioPrintAgent_Boot" >nul 2>nul && (echo      [OK] CardapioPrintAgent_Boot) || (echo      [X] CardapioPrintAgent_Boot NAO criada)
schtasks /Query /TN "CardapioPrintAgent_Logon" >nul 2>nul && (echo      [OK] CardapioPrintAgent_Logon) || (echo      [X] CardapioPrintAgent_Logon NAO criada)
schtasks /Query /TN "CardapioPrintAgent_Watchdog" >nul 2>nul && (echo      [OK] CardapioPrintAgent_Watchdog) || (echo      [X] CardapioPrintAgent_Watchdog NAO criada)
schtasks /Query /TN "CardapioPrintAgent" >nul 2>nul && echo      [!] Tarefa antiga "CardapioPrintAgent" existe - rode uninstall+install pra limpar
echo.

REM ── [5] Processos rodando ─────────────────────────
echo  [5] Processos node.exe rodando:
tasklist /FI "IMAGENAME eq node.exe" 2>nul
echo.

REM ── [6] Testa rodar wscript no runner.vbs direto ──
echo  [6] Testando wscript runner.vbs (5s)...
if exist "%~dp0runner.vbs" (
  start /B wscript.exe "%~dp0runner.vbs"
  timeout /t 5 /nobreak >nul
  tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
  if errorlevel 1 (
    echo      [X] Mesmo apos start manual, node nao subiu.
    echo      Provavel: erro no runner.vbs ou no index.js
  ) else (
    echo      [OK] node subiu - agente esta funcional via runner.
  )
) else (
  echo      [pulado - runner.vbs nao existe]
)
echo.

REM ── [7] Ultimo log ────────────────────────────────
echo  [7] Ultimas 20 linhas de agent.log:
echo  ---------------------------------------
if exist "%~dp0agent.log" (
  REM Powershell pra pegar ultimas linhas (tail)
  powershell -NoProfile -Command "Get-Content -Path '%~dp0agent.log' -Tail 20 -ErrorAction SilentlyContinue" 2>nul
) else (
  echo      (agent.log nao existe ainda - agente nunca rodou)
)
echo  ---------------------------------------
echo.

echo  ============================================
echo  PROXIMOS PASSOS DEPENDENDO DO RESULTADO:
echo  ============================================
echo.
echo  Se [4] mostrou tarefas NAO criadas:
echo      Rode install-service.bat COMO ADMINISTRADOR.
echo.
echo  Se [5] nao tem processo node:
echo      Tente: schtasks /Run /TN "CardapioPrintAgent_Boot"
echo      Aguarde 5s e roda este script novamente.
echo.
echo  Se [6] falhou:
echo      Olhe [7] (ultimas linhas do log) pra ver o erro real.
echo      Se nao tem log, abra agent.log manualmente.
echo.
echo  Se TUDO esta OK mas o painel diz offline:
echo      Confere config.json - URL do master + agentKey corretos?
echo      Confere internet do PC: ping app.tthreedigital.com.br
echo.
echo  ============================================
echo.
pause
exit /b 0
