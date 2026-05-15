@echo off
:: install-rustdesk-agent.bat
:: Wrapper double-click pro install-rustdesk-agent.ps1
::
:: Uso: edite RELAY/KEY/PASS abaixo OU passe como args:
::   install-rustdesk-agent.bat <relay> <key> <pass>
::
:: O painel Three Digital em /painel/maquinas → Configurar suporte
:: gera os 3 valores prontos pra copiar.

setlocal enabledelayedexpansion

set "RELAY=%~1"
set "KEY=%~2"
set "PASS=%~3"
set "AUTOACEITE=%~4"

if "%RELAY%"=="" (
    echo.
    echo Cole os valores do painel Three Digital:
    echo.
    set /p RELAY="Relay (ex: 1.2.3.4): "
    set /p KEY="Chave publica: "
    set /p PASS="Senha permanente: "
    set /p AUTOACEITE="Auto-aceite? (s/n): "
)

set "PSARGS=-Relay '%RELAY%' -Key '%KEY%' -Pass '%PASS%'"
if /i "%AUTOACEITE%"=="s" set "PSARGS=%PSARGS% -AutoAceite"
if /i "%AUTOACEITE%"=="--auto-aceite" set "PSARGS=%PSARGS% -AutoAceite"

set "SCRIPT=%~dp0install-rustdesk-agent.ps1"

if not exist "%SCRIPT%" (
    echo Script PowerShell nao encontrado em %SCRIPT%
    echo Baixando da Three Digital...
    powershell -NoProfile -Command "iwr https://app.tthreedigital.com.br/install-agent.ps1 -OutFile '%TEMP%\install-rustdesk-agent.ps1' -UseBasicParsing"
    set "SCRIPT=%TEMP%\install-rustdesk-agent.ps1"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %PSARGS%

endlocal
