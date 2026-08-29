@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Atlas Runner

where node.exe >nul 2>&1
if errorlevel 1 (
  echo.
  echo Atlas Runner requires Node.js 22.13 or newer.
  echo Download Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo.
  echo npm was not found. Reinstall Node.js with npm enabled.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4300/api/health' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  echo Atlas Runner is already running. Opening the dashboard...
  start "" "http://localhost:3000/"
  exit /b 0
)

if not exist "node_modules\.package-lock.json" (
  echo Installing project dependencies...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

echo Checking the Playwright Chromium installation...
call npx.cmd playwright install chromium
if errorlevel 1 goto :failed

echo Starting Atlas Runner...
echo The dashboard will open automatically at http://localhost:3000/
echo Keep this window open while Atlas Runner is in use.
echo Press Ctrl+C to stop it.
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(45); do { try { $response = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { Start-Process 'http://localhost:3000/'; exit } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline)"
call npm.cmd run dev
exit /b %errorlevel%

:failed
echo.
echo Atlas Runner could not be started. Review the messages above.
echo.
pause
exit /b 1
