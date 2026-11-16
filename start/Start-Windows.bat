@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "NODE=%ROOT%\runtime\win32-x64\node.exe"

if not exist "%NODE%" (
  echo Fuer Windows ist auf dem Stick nichts vorhanden.
  pause
  exit /b 1
)

set "STICK_ROOT=%ROOT%"
"%NODE%" "%ROOT%\launcher\menu.mjs"
pause
