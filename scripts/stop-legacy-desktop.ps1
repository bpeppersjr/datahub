$ErrorActionPreference = 'Stop'
$collectorRoot = Split-Path -Parent $PSScriptRoot
$collectorExe = Join-Path $collectorRoot 'node_modules\electron\dist\electron.exe'
$collectorEntry = Join-Path $collectorRoot 'desktop\main.mjs'
# Older desktop versions have no stop receipt. Ask only this repository's
# desktop window to close; never kill a process merely because it owns a port.
$collectorProcesses = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" | Where-Object {
    $_.ExecutablePath -eq $collectorExe -and
    $_.CommandLine -match ([regex]::Escape('"' + $collectorEntry + '"') + '\s*$')
}
foreach ($collectorProcess in $collectorProcesses) {
    $desktopProcess = Get-Process -Id $collectorProcess.ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $desktopProcess) { continue }
    if (-not $desktopProcess.WaitForExit(2000)) {
        if (-not $desktopProcess.CloseMainWindow()) {
            throw 'Previous Collector desktop could not close gracefully. Close its window and retry.'
        }
        if (-not $desktopProcess.WaitForExit(45000)) {
            throw 'Previous Collector desktop is still closing. Startup was stopped.'
        }
    }
}
