#requires -version 5.1
<#
.SYNOPSIS
  CommandPulse CMMS API health watchdog.

.DESCRIPTION
  Polls the API health endpoint. After three consecutive failures it restarts the
  API Windows service and records the outcome. It runs as SYSTEM from the
  Scheduled Task "CommandPulse CMMS Health Watchdog" every five minutes.

  The watchdog deliberately does NOT restart anything on the first or second
  failure: a single slow response during a backup or a migration must not cause a
  restart. The counter is persisted in a small JSON file so it survives between
  task runs, and it is reset by the first successful probe.

  Every action is appended to the watchdog log. The log rotates at 1 MB so a
  permanently failing service cannot fill the disk.
#>
[CmdletBinding()]
param(
  [string]$ServiceName = "CommandPulseCMMSAPI",
  [string]$Url = "http://127.0.0.1:4000/api/health",
  [int]$Threshold = 3,
  [int]$TimeoutSeconds = 10,
  [int]$RestartTimeoutSeconds = 120,
  [string]$LogPath = "",
  [string]$StatePath = ""
)

$ErrorActionPreference = "Stop"

if (-not $LogPath) { $LogPath = Join-Path (Split-Path $PSScriptRoot -Parent) "logs\watchdog.log" }
if (-not $StatePath) { $StatePath = Join-Path (Split-Path $PSScriptRoot -Parent) "logs\watchdog-state.json" }
$logDir = Split-Path $LogPath -Parent
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

function Write-WatchdogLog {
  param([string]$Level, [string]$Message)
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1,-5} {2}" -f (Get-Date), $Level, $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  # Rotate at 1 MB, keeping one previous file.
  try {
    $file = Get-Item -LiteralPath $LogPath -ErrorAction SilentlyContinue
    if ($file -and $file.Length -gt 1MB) {
      Move-Item -LiteralPath $LogPath -Destination ($LogPath + ".1") -Force
    }
  } catch { }
}

function Read-WatchdogState {
  $state = [pscustomobject]@{
    consecutiveFailures = 0
    lastFailure = $null
    lastRestart = $null
    lastSuccess = $null
  }
  if (Test-Path -LiteralPath $StatePath) {
    try {
      $raw = Get-Content -LiteralPath $StatePath -Raw
      if ($raw -and $raw.Trim()) {
        $saved = $raw | ConvertFrom-Json
        if ($null -ne $saved.consecutiveFailures) { $state.consecutiveFailures = [int]$saved.consecutiveFailures }
        $state.lastFailure = $saved.lastFailure
        $state.lastRestart = $saved.lastRestart
        $state.lastSuccess = $saved.lastSuccess
      }
    } catch {
      Write-WatchdogLog "WARN" "State file '$StatePath' was unreadable; counter reset"
    }
  }
  return $state
}

function Save-WatchdogState {
  param($State)
  $tmp = $StatePath + ".tmp"
  $State | ConvertTo-Json | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $StatePath -Force
}

function Test-ApiHealth {
  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    if ($resp.StatusCode -eq 200) {
      return [pscustomobject]@{ Ok = $true; Detail = "HTTP 200" }
    }
    return [pscustomobject]@{ Ok = $false; Detail = "HTTP $($resp.StatusCode)" }
  } catch {
    return [pscustomobject]@{ Ok = $false; Detail = $_.Exception.Message }
  }
}

$state = Read-WatchdogState
$probe = Test-ApiHealth

if ($probe.Ok) {
  if ($state.consecutiveFailures -gt 0) {
    Write-WatchdogLog "OK" "API recovered after $($state.consecutiveFailures) consecutive failure(s)"
  }
  $state.consecutiveFailures = 0
  $state.lastSuccess = (Get-Date).ToString("o")
  Save-WatchdogState -State $state
  exit 0
}

$state.consecutiveFailures = [int]$state.consecutiveFailures + 1
$state.lastFailure = (Get-Date).ToString("o")
Write-WatchdogLog "WARN" ("Health probe failed ({0}/{1}): {2}" -f $state.consecutiveFailures, $Threshold, $probe.Detail)
Save-WatchdogState -State $state

if ($state.consecutiveFailures -lt $Threshold) {
  exit 0
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-WatchdogLog "ERR" "Service '$ServiceName' does not exist; cannot restart it"
  exit 1
}

Write-WatchdogLog "ERR" ("{0} consecutive health failures; restarting service '{1}'" -f $state.consecutiveFailures, $ServiceName)
$restartOk = $true
try {
  Restart-Service -Name $ServiceName -Force -ErrorAction Stop
} catch {
  $restartOk = $false
  Write-WatchdogLog "ERR" "Restart-Service failed: $($_.Exception.Message)"
}

# A restart is not a recovery. Wait for the endpoint to answer before claiming
# success, so the next run does not report a false recovery.
$recovered = $false
if ($restartOk) {
  $deadline = (Get-Date).AddSeconds($RestartTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    if ((Test-ApiHealth).Ok) { $recovered = $true; break }
  }
}

$state.consecutiveFailures = 0
$state.lastRestart = (Get-Date).ToString("o")
Save-WatchdogState -State $state

if ($recovered) {
  Write-WatchdogLog "OK" "Service '$ServiceName' restarted and the API is answering"
  exit 0
}

Write-WatchdogLog "ERR" "Service '$ServiceName' did not recover within $RestartTimeoutSeconds s"
exit 1
