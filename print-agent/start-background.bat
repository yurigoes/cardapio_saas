@echo off
REM ═══════════════════════════════════════════════════════════
REM Cardapio Print Agent - Inicia em SEGUNDO PLANO
REM
REM Diferenca do start.bat: roda DETACHADO, voce pode fechar o CMD
REM e o agente continua. Mais simples que install-service.bat.
REM
REM Pra autostart no boot: rode install-startup.bat (uma vez).
REM ═══════════════════════════════════════════════════════════
title Cardapio Print Agent - Inicializar
cd /d "%~dp0"

REM Mata processo anterior (evita duplicacao)
taskkill /F /FI "WINDOWTITLE eq CardapioPrintAgent" >nul 2>nul

REM Inicia em segundo plano com janela MINIMIZADA + titulo
REM /B nao funciona com >> redirect, entao usamos start "title"
start "CardapioPrintAgent" /MIN cmd /c "node index.js >> agent.log 2>&1"

REM Da 3s pro node subir
timeout /t 3 /nobreak >nul

REM Verifica se subiu
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo.
  echo  [X] Agente NAO subiu. Verifique:
  echo      - node esta instalado:    node --version
  echo      - config.json existe:     dir config.json
  echo      - log de erros:           type agent.log
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo  [OK] Agente rodando em segundo plano!
echo  ============================================
echo.
echo  Voce pode FECHAR esta janela.
echo  O agente continua rodando.
echo.
echo  Pra ver o que esta acontecendo:
echo      type agent.log
echo.
echo  Pra parar o agente:
echo      taskkill /F /IM node.exe
echo.
echo  Pra rodar TODA VEZ no boot do PC:
echo      install-startup.bat (como admin)
echo.
echo  ============================================
echo.
echo  Fechando em 8s...
timeout /t 8 /nobreak >nul
exit /b 0
