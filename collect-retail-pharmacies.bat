@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Co*Tive Collector - Retail Pharmacy Directory

set "NPPES_INPUT=%~1"
set "ENRICHMENT_INPUT=%~2"

if /I "%NPPES_INPUT%"=="auto" set "NPPES_INPUT="

if defined NPPES_INPUT if not exist "%NPPES_INPUT%" (
  echo NPPES input not found: %NPPES_INPUT%
  pause
  exit /b 1
)

if defined ENRICHMENT_INPUT if not exist "%ENRICHMENT_INPUT%" (
  echo Enrichment input not found: %ENRICHMENT_INPUT%
  pause
  exit /b 1
)

if not defined NPPES_INPUT goto AUTO_SOURCE
if not defined ENRICHMENT_INPUT goto CUSTOM_SOURCE

node scripts\build-retail-pharmacy-directory.mjs --nppes "%NPPES_INPUT%" --enrichment "%ENRICHMENT_INPUT%" --output "data\pharmacies" --zip-start 00100 --zip-end 99999
goto AFTER_RUN

:CUSTOM_SOURCE
node scripts\build-retail-pharmacy-directory.mjs --nppes "%NPPES_INPUT%" --output "data\pharmacies" --zip-start 00100 --zip-end 99999
goto AFTER_RUN

:AUTO_SOURCE
echo The current CMS NPPES V2 source will be downloaded and prepared automatically.
if defined ENRICHMENT_INPUT (
  node scripts\build-retail-pharmacy-directory.mjs --enrichment "%ENRICHMENT_INPUT%" --output "data\pharmacies" --zip-start 00100 --zip-end 99999
) else (
  node scripts\build-retail-pharmacy-directory.mjs --output "data\pharmacies" --zip-start 00100 --zip-end 99999
)

:AFTER_RUN
if errorlevel 1 (
  echo.
  echo Pharmacy directory collection failed. Review the message above.
  pause
  exit /b 1
)

echo.
echo Pharmacy directory files are ready in data\pharmacies.
pause
