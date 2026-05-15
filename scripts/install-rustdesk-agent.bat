@echo off
:: install-rustdesk-agent.bat
:: Wrapper double-click pro install-rustdesk-agent.ps1
::
:: Uso 1 (interativo): double-click → pede valores
:: Uso 2 (args):       install-rustdesk-agent.bat <relay> <key> <pass> [s]

setlocal enabledelayedexpansion

set "RELAY=%~1"
set "KEY=%~2"
set "PASS=%~3"
set "AUTOACEITE=%~4"

if "%RELAY%"=="" (
    echo.
    echo  ============================================
    echo   Three Digital — Instalador RustDesk Agent
    echo  ============================================
    echo.
    set /p "RELAY=Relay (ex: rustdesk.tthreedigital.com.br): "
    set /p "KEY=Chave publica: "
    set /p "PASS=Senha permanente: "
    set /p "AUTOACEITE=Auto-aceite? (s/n): "
)

if "!RELAY!"=="" goto :erro_args
if "!KEY!"=="" goto :erro_args
if "!PASS!"=="" goto :erro_args

:: Sempre baixa script atualizado da Three Digital (em vez de depender de
:: arquivo .ps1 ao lado, que pode estar desatualizado)
set "SCRIPT=%TEMP%\install-rustdesk-agent.ps1"
echo.
echo  Baixando script de instalacao...
powershell -NoProfile -Command "try { iwr https://app.tthreedigital.com.br/install-agent.ps1 -OutFile '%SCRIPT%' -UseBasicParsing -ErrorAction Stop; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo  [ERRO] Nao consegui baixar o script. Verifique sua conexao.
    pause
    exit /b 1
)

set "PSARGS=-Relay '!RELAY!' -Key '!KEY!' -Pass '!PASS!'"
if /i "!AUTOACEITE!"=="s" set "PSARGS=!PSARGS! -AutoAceite"
if /i "!AUTOACEITE!"=="y" set "PSARGS=!PSARGS! -AutoAceite"
if /i "!AUTOACEITE!"=="--auto-aceite" set "PSARGS=!PSARGS! -AutoAceite"

echo.
echo  Executando instalador (pode pedir UAC)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%SCRIPT%' !PSARGS!"

if errorlevel 1 (
    echo.
    echo  [ERRO] Instalacao falhou. Mensagem acima.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   Concluido! Cole o ID gerado no painel.
echo  ============================================
echo.
pause
exit /b 0

:erro_args
echo.
echo  [ERRO] Faltou algum dado. Tente novamente.
pause
exit /b 1
