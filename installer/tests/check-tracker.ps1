#requires -version 5.1
<#
.SYNOPSIS
  Validates docs/INSTALLER_TRACKER.md.

.DESCRIPTION
  Fails when a row has an unknown state, when a Closed row has no evidence, or
  when an ID is duplicated or out of sequence. The script is text-only on
  purpose so it runs on the Linux CI runner as well as on Windows.
#>
[CmdletBinding()]
param(
  [string]$Path = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Path) {
  $Path = Join-Path (Join-Path $repoRoot "docs") "INSTALLER_TRACKER.md"
}

if (-not (Test-Path -LiteralPath $Path)) {
  Write-Host "FAIL  tracker not found: $Path" -ForegroundColor Red
  exit 1
}

$allowedStates = @("Open", "In progress", "Blocked", "Closed")
$emptyEvidence = @("", "-", "--", "TBD", "n/a")
$errors = New-Object System.Collections.Generic.List[string]
$seen = @{}
$expected = 1

$rows = @(Get-Content -LiteralPath $Path | Where-Object { $_ -match '^\|\s*I-\d+\s*\|' })

if ($rows.Count -eq 0) {
  Write-Host "FAIL  no tracker rows found in $Path" -ForegroundColor Red
  exit 1
}

foreach ($line in $rows) {
  $cells = @($line.Split('|') | ForEach-Object { $_.Trim() })
  # A well-formed row is: "" | ID | Concern | State | Owner | Evidence | ""
  if ($cells.Count -lt 7) {
    $errors.Add("malformed row (expected 5 columns): $line")
    continue
  }
  $id = $cells[1]
  $concern = $cells[2]
  $state = $cells[3]
  $owner = $cells[4]
  $evidence = $cells[5]

  $number = 0
  if ($id -notmatch '^I-(\d+)$') {
    $errors.Add("bad ID '$id'")
    continue
  }
  $number = [int]$Matches[1]
  if ($seen.ContainsKey($id)) { $errors.Add("duplicate ID $id") }
  $seen[$id] = $true

  if ($number -ne $expected) {
    $errors.Add("ID sequence broken: expected I-{0:D2}, found {1}" -f $expected, $id)
  }
  $expected = $number + 1

  if (-not $concern) { $errors.Add("$id has no concern text") }
  if (-not $owner) { $errors.Add("$id has no owner") }
  if ($allowedStates -notcontains $state) {
    $errors.Add("$id has unknown state '$state' (allowed: $($allowedStates -join ', '))")
  }
  if ($state -eq "Closed" -and $emptyEvidence -contains $evidence) {
    $errors.Add("$id is Closed but carries no evidence")
  }
  if ($state -ne "Closed" -and $evidence -ne "-") {
    Write-Host "note  $id is $state but has evidence text" -ForegroundColor Yellow
  }
}

if ($errors.Count -gt 0) {
  Write-Host "FAIL  $($errors.Count) tracker problem(s):" -ForegroundColor Red
  foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
  exit 1
}

Write-Host "PASS  $($rows.Count) tracker rows valid" -ForegroundColor Green
exit 0
