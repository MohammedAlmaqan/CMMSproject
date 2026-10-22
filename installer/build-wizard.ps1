#requires -version 5.1
<#
.SYNOPSIS
  Compiles installer/wizard/CommandPulse.iss to installer/out/Setup_CommandPulse.exe.

.DESCRIPTION
  Finds ISCC.exe on PATH, in Program Files, or in the per-user Inno Setup 6
  install, then compiles. The output directory is installer/out, which is
  gitignored: the compiled .exe is never committed and never added to the
  application bundle, because the bundle is verified by SHA256SUMS and the .exe
  is not part of that manifest.
#>
[CmdletBinding()]
param(
  [string]$OutputDir = "",
  [string]$IsccPath = ""
)

$ErrorActionPreference = "Stop"

$installerDir = $PSScriptRoot
$iss = Join-Path (Join-Path $installerDir "wizard") "CommandPulse.iss"
if (-not (Test-Path -LiteralPath $iss)) { throw "Wizard source not found: $iss" }

if (-not $OutputDir) { $OutputDir = Join-Path $installerDir "out" }

if (-not $IsccPath) {
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { $IsccPath = $cmd.Source }
}
if (-not $IsccPath) {
  foreach ($candidate in @(
      (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
      "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
      "C:\Program Files\Inno Setup 6\ISCC.exe")) {
    if (Test-Path -LiteralPath $candidate) { $IsccPath = $candidate; break }
  }
}
if (-not $IsccPath) {
  throw "ISCC.exe not found. Install Inno Setup 6 and re-run, or pass -IsccPath."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Write-Host "ISCC    : $IsccPath"
Write-Host "Source  : $iss"
Write-Host "Output  : $OutputDir"

& $IsccPath "/O$OutputDir" $iss
if ($LASTEXITCODE -ne 0) { throw "ISCC failed with exit code $LASTEXITCODE" }

$exe = Join-Path $OutputDir "Setup_CommandPulse.exe"
if (-not (Test-Path -LiteralPath $exe)) {
  throw "ISCC reported success but $exe is missing."
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $exe).Hash
Write-Host "Compiled: $exe"
Write-Host "SHA256  : $hash"
