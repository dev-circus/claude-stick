@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "NODE=%ROOT%\runtime\win32-x64\node.exe"

if not exist "%NODE%" (
  echo Erster Start auf diesem Computer: Node.js wird geladen ^(einmalig, etwa 30 MB^) ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\launcher\get-node.ps1" -Root "%ROOT%"
  if errorlevel 1 (
    echo.
    echo Das hat nicht geklappt. Ist der Computer online?
    echo Blockiert eine Firmenregel das Programm, ist dieser Rechner nicht geeignet.
    pause
    exit /b 1
  )
)

if defined STICK_SETUP_ONLY (
  "%NODE%" --version
  exit /b %errorlevel%
)

set "STICK_ROOT=%ROOT%"
"%NODE%" "%ROOT%\launcher\menu.mjs"
pause
