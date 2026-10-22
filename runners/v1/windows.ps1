# Run it only in a Windows machine with no route out: a use case can bind every interface.
param(
    [Parameter(Mandatory = $true)] [string] $Version
)
$ErrorActionPreference = 'Stop'

$name = "node-$Version-win-x64"
$zip = Join-Path $PSScriptRoot "$name.zip"
$line = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SHASUMS256.txt') | Where-Object { $_ -match "^[0-9a-f]{64}  $name\.zip$" }
if (-not $line -or (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash -ne $line.Substring(0, 64)) {
    throw "$name.zip does not match its line in SHASUMS256.txt"
}
tar.exe -x -f $zip -C $PSScriptRoot "$name/node.exe"
if ($LASTEXITCODE -ne 0) {
    throw "tar.exe exited with $LASTEXITCODE"
}

$os = Get-CimInstance Win32_OperatingSystem
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
[Console]::Out.Write("guest: $($os.Caption) $($cv.DisplayVersion), build $($cv.CurrentBuild).$($cv.UBR)`n")

$start = New-Object Diagnostics.ProcessStartInfo (Join-Path $PSScriptRoot "$name\node.exe"), 'case\measure.mjs'
$start.WorkingDirectory = $PSScriptRoot
$start.UseShellExecute = $false
$start.RedirectStandardOutput = $true
# A Windows machine has no /.dockerenv for the guard of the use case to find.
$start.EnvironmentVariables['MCP_BIND_ISOLATED'] = '1'
$node = [Diagnostics.Process]::Start($start)
while ($null -ne ($out = $node.StandardOutput.ReadLine())) {
    [Console]::Out.Write("$out`n")
    if ($out -eq 'done' -or $out -eq 'MISMATCH') {
        break
    }
}
# A server that stays open keeps node running after its last line.
if (-not $node.WaitForExit(10000)) {
    $node.Kill()
    [Console]::Error.WriteLine('node still ran 10 s after its last line, so the run stopped it')
    exit 3
}
exit $node.ExitCode
