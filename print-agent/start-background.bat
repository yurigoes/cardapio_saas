@echo off
REM ═══════════════════════════════════════════════════════════
REM Cardapio Print Agent - Inicia em SEGUNDO PLANO (v2)
REM
REM Usa wscript runner.vbs pra rodar SEM JANELA NENHUMA.
REM Voce pode fechar QUALQUER cmd, agente continua invisivel.
REM
REM Pra parar: kill-duplicates.bat (opcao 1 = so do agente)
REM            ou taskkill /F /IM node.exe (mata todos node)
REM
REM Pra autostart no logon: install-startup.bat (cria atalho Startup)
REM Pra autostart com watchdog: install-service.bat (como admin)
REM ═══════════════════════════════════════════════════════════
title Cardapio Print Agent - Inicializar
cd /d "%~dp0"

REM Limpa lock obsoleto se houver
if exist agent.lock (
  REM Le PID e checa se ainda esta vivo
  set /p OLDPID=<agent.lock
  tasklist /FI "PID eq %OLDPID%" 2>nul | findstr /I "node.exe" >nul
  if errorlevel 1 (
    del /F agent.lock 2>nul
  )
)

REM Garante node-path.txt existe (necessario pro runner.vbs em SYSTEM)
if not exist node-path.txt (
  for /f "tokens=*" %%i in ('where node 2^>nul') do (
    echo %%i > node-path.txt
    goto :nodefound
  )
  echo [X] node.exe nao achado no PATH. Instale Node.js 18+.
  pause
  exit /b 1
)
:nodefound

REM Mata processo anterior do agente (anti-dup)
taskkill /F /FI "WINDOWTITLE eq CardapioPrintAgent*" >nul 2>nul

REM ── Lanca via wscript runner.vbs (TOTALMENTE INVISIVEL) ─────
REM wscript executa o VBS e sai. O VBS lanca node detachado em
REM cmd hidden (WshShell.Run cmdLine, 0, False). Resultado: node
REM rodando em segundo plano sem janela nenhuma visivel.
wscript.exe "%~dp0runner.vbs"

REM Da 5s pro node subir e escrever no log
timeout /t 5 /nobreak >nul

REM Verifica se node subiu
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo.
  echo  [X] Agente NAO subiu. Verifique:
  echo      check-status.bat        diagnostico completo
  echo      type agent.log          ultimos erros
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo  [OK] Agente rodando INVISIVEL em segundo plano!
echo  ============================================
echo.
echo  Voce pode FECHAR esta janela. Pode reiniciar o
echo  PC, fechar tudo - agente continua rodando.
echo.
echo  Pra ver status:        check-status.bat
echo  Pra ver log ao vivo:   type agent.log
echo  Pra parar:             kill-duplicates.bat
echo.
echo  Pra autostart no logon do PC:
echo      install-startup.bat (atalho na pasta Startup)
echo.
echo  ============================================
echo.
echo  Fechando em 8s...
timeout /t 8 /nobreak >nul
exit /b 0
