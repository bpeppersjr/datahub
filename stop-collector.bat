@echo off
setlocal
cd /d "%~dp0"
node scripts\stop-dev-web.mjs %*
exit /b %errorlevel%
