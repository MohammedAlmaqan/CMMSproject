#requires -version 5.1
<#
.SYNOPSIS
  Wizard orchestration script for CommandPulse CMMS installer.
.DESCRIPTION
  Called by Inno Setup wizard to invoke the tested install.ps1 engine
  with parameters collected from the UI. Reads password from temp file.
#>
[CmdletBinding()]
param(
  [string]$BundlePath = "",
  [string]$InstallRoot = "C:\CMMS",
  [string]$PgHost = "localhost",
  [string]$PgPort = "5432",
  [string]$PgUser = "postgres",
  [string]$PgPassFile = "",
  [string]$DbName = "cmms",
  [string]$ApiPort = "4000",
  [string]$BindHost = "127.0.0.1",
  [string]$SiteName = "cmms.local",
  [string]$CorsOrigins = "",
  [string]$AppNamePrefix = "",
  [string]$PrismaEnginesPath = ""
)

$ErrorActionPreference = "Stop"

$pgPass = $null
if ($PgPassFile -and (Test-Path $PgPassFile)) {
  $pgPass = Get-Content $PgPassFile -Raw
  $pgPass = $pgPass.Trim()
}

$env:CMMS_PGPASSWORD = $pgPass

$engine = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "install.ps1"
if (-not (Test-Path $engine)) {
  $engine = "C:\Program Files\CommandPulse\CMMS\installer\install.ps1"
}

$args = @(
  "-SourceBundle", $BundlePath,
  "-InstallRoot", $InstallRoot,
  "-PgHost", $PgHost,
  "-PgPort", $PgPort,
  "-PgUser", $PgUser,
  "-PgPasswordEnv", "CMMS_PGPASSWORD",
  "-DbName", $DbName,
  "-ApiPort", $ApiPort,
  "-BindHost", $BindHost,
  "-SiteName", $SiteName,
  "-Mode", "full"
)

if ($CorsOrigins) { $args += @("-CorsOrigins", $CorsOrigins) }
if ($AppNamePrefix) { $args += @("-AppNamePrefix", $AppNamePrefix) }
if ($PrismaEnginesPath) { $args += @("-PrismaEnginesPath", $PrismaEnginesPath) }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $engine @args
$exitCode = $LASTEXITCODE

Remove-Item Env:\CMMS_PGPASSWORD -ErrorAction SilentlyContinue
exit $exitCode
