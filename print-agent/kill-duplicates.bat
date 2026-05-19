@echo off
REM ═══════════════════════════════════════════════════════════
REM Cardapio Print Agent - Mata processos duplicados
REM
REM Usar quando check-status mostra MUITOS processos node rodando
REM (sintoma de bug anti-dup antigo). Mata todos os node.exe
REM relacionados ao agente e o agente sobe limpo no proximo
REM ciclo do Watchdog (5min) ou via start-background.bat.
REM
REM CUIDADO: se voce roda OUTROS processos node legitimos no PC
REM (Discord, dev local), use a versao por title em vez do all.
REM ═══════════════════════════════════════════════════════════
title Cardapio Print Agent - Limpar Duplicados
cd /d "%~dp0"

echo.
echo  ============================================
echo  Cardapio Print Agent - Matar duplicados
echo  ============================================
echo.

REM Conta quantos node.exe estao rodando
for /f "tokens=*" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul ^| find /C "node.exe"') do set ANTES=%%a
echo  Processos node.exe rodando agora: %ANTES%
echo.

echo  Pra matar:
echo     [1] APENAS processos do agente (busca por janela CardapioPrintAgent*)
echo     [2] TODOS node.exe (mais agressivo - cuidado com Discord/dev)
echo     [3] Cancelar
echo.
set /p OPCAO=Escolha (1/2/3):

if "%OPCAO%"=="1" goto KILL_SAFE
if "%OPCAO%"=="2" goto KILL_ALL
echo Cancelado.
pause
exit /b 0

:KILL_SAFE
echo.
echo Matando processos com janela CardapioPrintAgent...
taskkill /F /FI "WINDOWTITLE eq CardapioPrintAgent*" 2>nul
echo Removendo lock file...
if exist agent.lock del /F agent.lock
goto DONE

:KILL_ALL
echo.
echo Matando TODOS node.exe...
taskkill /F /IM node.exe 2>nul
echo Removendo lock file...
if exist agent.lock del /F agent.lock
goto DONE

:DONE
timeout /t 2 /nobreak >nul
for /f "tokens=*" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul ^| find /C "node.exe"') do set DEPOIS=%%a
echo.
echo  Processos node.exe agora: %DEPOIS%
echo.
echo  Pra subir o agente limpo:
echo     start-background.bat
echo  Ou aguarde 5min pro Watchdog religar.
echo.
pause
