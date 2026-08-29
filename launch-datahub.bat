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

if not exist "node_modules\.package-lock.json" (
  echo Installing project dependencies...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing the Atlas Runner desktop shell...
  call npx.cmd install-electron
  if errorlevel 1 goto :failed
)

set "PLAYWRIGHT_BROWSERS_PATH=%~dp0.playwright-browsers"
echo Checking the Playwright Chromium installation...
call npx.cmd playwright install chromium
if errorlevel 1 goto :failed

echo Preparing the standalone management page...
call npm.cmd run desktop:build
if errorlevel 1 goto :failed

echo Opening Atlas Runner...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0desktop\main.mjs"
exit /b 0

:failed
echo.
echo Atlas Runner could not be started. Review the messages above.
echo.
pause
exit /b 1
