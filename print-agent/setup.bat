@echo off
REM ═══════════════════════════════════════════════════════════
REM   Cardapio Print Agent — Setup
REM   Duplo clique para configurar o agente.
REM ═══════════════════════════════════════════════════════════
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  Cardapio Print Agent - Setup
echo  ============================
echo.

REM Checa Node
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js nao encontrado.
  echo.
  echo     Baixe e instale o Node.js LTS em:
  echo     https://nodejs.org/
  echo.
  echo     Apos instalar, rode este setup.bat novamente.
  pause
  exit /b 1
)

echo [OK] Node.js detectado.
node --version
echo.

REM Roda o wizard
node setup-wizard.js
if errorlevel 1 (
  echo.
  echo [X] Setup falhou. Veja a mensagem acima.
  pause
  exit /b 1
)

echo.
echo  ============================
echo  Configuracao concluida!
echo  ============================
echo.
echo  Para TESTAR agora (terminal aberto):
echo     start.bat
echo.
echo  Para INSTALAR como servico de fundo (sobe sozinho ao ligar o PC):
echo     install-service.bat   (clique direito - Executar como administrador)
echo.
pause
