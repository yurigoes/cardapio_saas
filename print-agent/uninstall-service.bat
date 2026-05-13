@echo off
REM Remove a tarefa agendada do agente.
setlocal

set "TASK_NAME=CardapioPrintAgent"

echo.
echo  Cardapio Print Agent - Desinstalar Servico
echo  ==========================================
echo.

schtasks /End /TN "%TASK_NAME%" >nul 2>nul
schtasks /Delete /TN "%TASK_NAME%" /F

if errorlevel 1 (
  echo.
  echo [!] Tarefa nao encontrada (talvez nunca foi instalada).
) else (
  echo.
  echo [OK] Servico desinstalado.
  echo      O agente nao roda mais automaticamente.
  echo      Configuracao (config.json) preservada.
)

REM runner.vbs nao e apagado (faz parte do agente, nao do servico)

echo.
pause
