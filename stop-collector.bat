@echo off
setlocal
cd /d "%~dp0"
node scripts\stop-dev-web.mjs %*
if errorlevel 1 exit /b %errorlevel%
if "%~1"=="--run-id" exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-legacy-desktop.ps1"
exit /b %errorlevel%
