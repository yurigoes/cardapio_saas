@echo off
REM Roda o agente em primeiro plano (terminal aberto).
cd /d "%~dp0"
node index.js
pause
