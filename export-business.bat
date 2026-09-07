@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the version specified by Co*Tive Collector.
  exit /b 1
)
if "%~1"=="" (
  node scripts/compose-flat-business-export.mjs --help
  exit /b 0
)
node scripts/compose-flat-business-export.mjs %*
exit /b %errorlevel%
