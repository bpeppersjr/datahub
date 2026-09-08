param([Parameter(Mandatory=$true)][string]$BasePython)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskRuntime = Join-Path $taskRoot 'data\runtimes\pdf-decoder-1'
$taskPython = Join-Path $taskRuntime 'Scripts\python.exe'
$taskLock = Join-Path $taskRoot 'config\pdf-runtime-win-cp314.lock'
$taskInstallReport = Join-Path $taskRuntime ('install-report-' + [guid]::NewGuid().ToString() + '.json')
function Assert-TaskPath([string]$Target) {
    $checked = [IO.Path]::GetFullPath($Target)
    if (!$checked.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path is outside datahub.' }
    while ($checked -ne $taskRoot) {
        if ((Test-Path -LiteralPath $checked) -and ((Get-Item -LiteralPath $checked).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Redirected runtime path rejected.' }
        $checked = Split-Path -Parent $checked
    }
}
$BasePython = (Resolve-Path -LiteralPath $BasePython).Path
if ($BasePython -match '[\\/]\.codex[\\/]|codex-runtimes') { throw 'Use an independently installed Python, not a Codex runtime.' }
$env:TEMP = Join-Path $taskRoot 'data\tmp'
$env:TMP = $env:TEMP
Assert-TaskPath $taskRuntime
Assert-TaskPath $taskPython
Assert-TaskPath $taskInstallReport
Assert-TaskPath $env:TEMP
Assert-TaskPath $taskLock
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
& $BasePython -I -B -c "import sys,platform; assert sys.version_info[:3]==(3,14,7) and sys.platform=='win32' and platform.machine()=='AMD64'"
if ($LASTEXITCODE -ne 0) { throw 'This runtime lock requires Windows x64 CPython 3.14.7.' }
if (!(Test-Path -LiteralPath $taskPython)) {
    if (Test-Path -LiteralPath $taskRuntime) { throw 'Runtime directory exists without its interpreter; inspect it before retrying.' }
    & $BasePython -I -B -m venv $taskRuntime
    if ($LASTEXITCODE -ne 0) { throw 'Runtime creation failed.' }
}
$resolvedRuntime = (Resolve-Path -LiteralPath $taskRuntime).Path
if ($resolvedRuntime -ne $taskRuntime -or (Get-Item -LiteralPath $taskRuntime).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected runtime directory rejected.' }
& $taskPython -I -B -c "import sys,pathlib; assert sys.version_info[:3]==(3,14,7) and pathlib.Path(sys.prefix).resolve()==pathlib.Path(sys.argv[1]).resolve() and 'codex' not in sys.base_prefix.lower()" $taskRuntime
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime does not match the independent app environment.' }
& $taskPython -I -B -m pip --isolated --disable-pip-version-check install --no-cache-dir --only-binary=:all: --require-hashes --index-url https://pypi.org/simple -r $taskLock --report $taskInstallReport
if ($LASTEXITCODE -ne 0) { throw 'Pinned dependency installation failed.' }
& $taskPython -I -B -m pip --isolated --disable-pip-version-check check
if ($LASTEXITCODE -ne 0) { throw 'Runtime dependency consistency check failed.' }
& $taskPython -I -B (Join-Path $PSScriptRoot 'verify-pdf-runtime.py')
if ($LASTEXITCODE -ne 0) { throw 'Installed runtime verification failed.' }
Write-Output 'Co*Tive PDF environment provisioned. This is not acquisition enrollment or an independent Python security audit.'
