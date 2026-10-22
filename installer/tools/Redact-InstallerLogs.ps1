#requires -version 5.1
<#
.SYNOPSIS
  Finds and redacts credentials in existing installer logs.

.DESCRIPTION
  An earlier engine revision used `pm2 jlist`, whose output contains the full
  environment block of every application, and wrote it into
  %ProgramData%\CommandPulse\logs. Those files still hold the PostgreSQL
  password in plaintext. The engine now redacts before writing, but the files
  written before that fix have to be scrubbed.

  The default is -Report: it prints the file name and the number of matches and
  changes nothing. -Apply rewrites the matching files in place, replacing the
  value with ***. The value itself is never printed.

  Redaction does not make a leaked password safe. Rotate the credential after
  running -Apply.
#>
[CmdletBinding()]
param(
  [string]$Path = "",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

if (-not $Path) {
  $Path = Join-Path $env:ProgramData "CommandPulse\logs"
}
if (-not (Test-Path -LiteralPath $Path)) {
  Write-Host "No log directory at $Path"
  exit 0
}

# Each entry keeps the surrounding syntax so the file still reads normally.
$patterns = @(
  @{ Regex = '(?i)("[A-Z0-9_]*PGPASSWORD"\s*:\s*")(?!\*\*\*")[^"]+(")'; Replacement = '$1***$2' },
  @{ Regex = '(?i)(PGPASSWORD\s*=\s*)(?!\*\*\*)[^;\s"'']+'; Replacement = '$1***' },
  @{ Regex = '(?i)(postgres(?:ql)?://[^:/@\s]+:)(?!\*\*\*)[^@\s]+(@)'; Replacement = '$1***$2' }
)

$files = @(Get-ChildItem -LiteralPath $Path -File -Recurse | Where-Object { $_.Length -lt 50MB })
$totalFiles = 0
$totalMatches = 0

foreach ($file in $files) {
  $raw = $null
  try { $raw = [System.IO.File]::ReadAllText($file.FullName) } catch { continue }
  if (-not $raw) { continue }

  $clean = $raw
  $matches = 0
  foreach ($p in $patterns) {
    $count = ([regex]::Matches($clean, $p.Regex)).Count
    $matches += $count
    if ($count -gt 0) { $clean = [regex]::Replace($clean, $p.Regex, $p.Replacement) }
  }
  if ($matches -eq 0) { continue }

  $totalFiles++
  $totalMatches += $matches
  Write-Host ("{0}  {1} match(es)" -f $file.Name, $matches)

  if ($Apply -and $clean -ne $raw) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($file.FullName, $clean, $enc)
  }
}

if ($totalFiles -eq 0) {
  Write-Host "No credential-shaped text found under $Path"
  exit 0
}

if ($Apply) {
  Write-Host "Redacted $totalMatches match(es) in $totalFiles file(s)."
  Write-Host "The credential was exposed on disk; rotate it now."
} else {
  Write-Host "Report only: $totalMatches match(es) in $totalFiles file(s). Re-run with -Apply to redact."
  exit 2
}
