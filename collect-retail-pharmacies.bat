@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Co*Tive Collector - Retail Pharmacy Directory

if "%~1"=="" (
  echo.
  echo Usage:
  echo   collect-retail-pharmacies.bat "path-to-NPPES-csv-or-folder" ["optional-NCPDP-dataQ-csv"]
  echo.
  echo Download and extract the current NPPES V2 file from:
  echo   https://download.cms.gov/nppes/NPI_Files.html
  echo.
  echo All generated files will be written under datahub\data\pharmacies.
  echo.
  pause
  exit /b 1
)

set "NPPES_INPUT=%~1"
set "ENRICHMENT_INPUT=%~2"

if not exist "%NPPES_INPUT%" (
  echo NPPES input not found: %NPPES_INPUT%
  pause
  exit /b 1
)

if defined ENRICHMENT_INPUT (
  node scripts\build-retail-pharmacy-directory.mjs --nppes "%NPPES_INPUT%" --enrichment "%ENRICHMENT_INPUT%" --output "data\pharmacies" --zip-start 00100 --zip-end 99999
) else (
  node scripts\build-retail-pharmacy-directory.mjs --nppes "%NPPES_INPUT%" --output "data\pharmacies" --zip-start 00100 --zip-end 99999
)

if errorlevel 1 (
  echo.
  echo Pharmacy directory collection failed. Review the message above.
  pause
  exit /b 1
)

echo.
echo Pharmacy directory files are ready in data\pharmacies.
pause
