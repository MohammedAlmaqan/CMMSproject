#requires -version 5.1
<#
.SYNOPSIS
  Engine test harness for the CommandPulse CMMS installer.
.DESCRIPTION
  Runs installer/install.ps1 against a THROWAWAY database and a scratch install root,
  then asserts the installer's contract. Never touches the live `cmms` database.

  On Windows PM2 keeps ONE daemon per user account: PM2_HOME relocates the logs
  and dump.pm2 but does not create a second daemon. The harness therefore gives
  the install a unique PM2 application name prefix, and it deletes only those
  names afterwards. It never runs `pm2 kill`, which would stop every
  application on the host, including the live CMMS.
#>
[CmdletBinding()]
param(
  [string]$SourceBundle = "C:\Users\Injaz\Documents\Default Project\CommandPulse-CMMS-v1.6.2",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$PgUser = "postgres",
  [string]$PgPassword = "",
  [int]$TestPort = 4111,
  [string]$PrismaEnginesPath = "",
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"
# Native command output is decoded with the console output encoding, which on
# Windows PowerShell 5.1 defaults to the OEM code page and mangles the
# box-drawing characters PM2 uses. The tools write UTF-8.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$script:Failures = @()
$script:Passes = 0

function Assert-True {
  param([string]$Name, [bool]$Condition, [string]$Detail = "")
  if ($Condition) { $script:Passes++; Write-Host "  PASS  $Name" -ForegroundColor Green }
  else { $script:Failures += "$Name $Detail"; Write-Host "  FAIL  $Name $Detail" -ForegroundColor Red }
}

function Get-PsqlPath {
  $c = Get-Command psql -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("C:\Program Files\PostgreSQL\18\bin\psql.exe","C:\Program Files\PostgreSQL\17\bin\psql.exe","C:\Program Files\PostgreSQL\16\bin\psql.exe","C:\Program Files\PostgreSQL\15\bin\psql.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$engine = Join-Path $repoRoot "installer\install.ps1"
if (-not $PrismaEnginesPath) {
  # Default to the engines already downloaded in this repository's own
  # node_modules, so the test does not depend on binaries.prisma.sh.
  $candidate = Join-Path $repoRoot "backend\node_modules\.prisma\client"
  if (Test-Path -LiteralPath $candidate) { $PrismaEnginesPath = $candidate }
}
$scratch = Join-Path $env:TEMP ("cmms-installer-test-" + (Get-Date -Format "yyyyMMddHHmmss"))
$installRoot = Join-Path $scratch "install"
$pm2Home = Join-Path $scratch "pm2-home"
$dbName = "cmms_installer_test_" + (Get-Random)
$psql = Get-PsqlPath
if (-not $psql) { throw "psql not found" }
if (-not $PgPassword) { $PgPassword = $env:PGPASSWORD }
if (-not $PgPassword) { throw "No PostgreSQL password supplied (-PgPassword or PGPASSWORD env)" }

Write-Host "=== CommandPulse CMMS installer engine tests ===" -ForegroundColor Cyan
Write-Host "scratch : $scratch"
Write-Host "database: $dbName (throwaway)"

# A unique PM2 application name prefix. PM2 on Windows has one daemon per
# user, so the prefix is what keeps the test off the live CMMS application
# names.
$appPrefix = "cmmstest" + (Get-Random -Minimum 100000 -Maximum 999999) + "-"
$testAppNames = @("$($appPrefix)api", "$($appPrefix)worker")

# An isolated PM2_HOME relocates PM2's logs and dump.pm2. It does NOT create a
# second daemon, so it is not isolation on its own.
$env:PM2_HOME = $pm2Home
New-Item -ItemType Directory -Force -Path $pm2Home | Out-Null

$env:PGPASSWORD = $PgPassword
& $psql -U $PgUser -h $PgHost -p $PgPort -c "CREATE DATABASE $dbName;" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to create throwaway database $dbName" }

try {
  Write-Host "`n-- running engine (full) --" -ForegroundColor Cyan
  # The password is passed through an environment variable, never as a command
  # line argument, so it cannot be read from the process list.
  $env:CMMS_INSTALLER_TEST_PGPASSWORD = $PgPassword
  & $engine -SourceBundle $SourceBundle -InstallRoot $installRoot `
    -PgHost $PgHost -PgPort $PgPort -PgUser $PgUser -PgPasswordEnv "CMMS_INSTALLER_TEST_PGPASSWORD" `
    -DbName $dbName -ApiPort $TestPort -SiteName "cmms.test.local" `
    -AppNamePrefix $appPrefix -PrismaEnginesPath $PrismaEnginesPath -Mode full
  $engineExit = $LASTEXITCODE
  Assert-True "engine exits 0" ($engineExit -eq 0) "(exit $engineExit)"

  Write-Host "`n-- assertions --" -ForegroundColor Cyan

  # 1. .env generated
  $envFile = Join-Path $installRoot "backend\.env"
  Assert-True "backend\.env generated" (Test-Path $envFile)

  # 2. .env ACL: exactly SYSTEM, BUILTIN\Administrators, and the current user
  if (Test-Path $envFile) {
    $acl = Get-Acl -LiteralPath $envFile
    $trustees = @($acl.Access | ForEach-Object { $_.IdentityReference.Value })
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $expected = @("NT AUTHORITY\SYSTEM","BUILTIN\Administrators",$me)
    $missing = @($expected | Where-Object { $trustees -notcontains $_ })
    $extra = @($trustees | Where-Object { $expected -notcontains $_ })
    Assert-True ".env ACL has SYSTEM" ($trustees -contains "NT AUTHORITY\SYSTEM")
    Assert-True ".env ACL has BUILTIN\Administrators" ($trustees -contains "BUILTIN\Administrators")
    Assert-True ".env ACL has current user" ($trustees -contains $me) "(got: $($trustees -join ', '))"
    Assert-True ".env ACL has no extra trustees" ($extra.Count -eq 0) "(extra: $($extra -join ', '))"
    Assert-True ".env ACL not inherited" ($acl.AreAccessRulesProtected)
  }

  # 3. .env content: no placeholder left, has DATABASE_URL for the throwaway db
  if (Test-Path $envFile) {
    $raw = Get-Content $envFile -Raw
    Assert-True ".env has no unreplaced placeholders" ($raw -notmatch '__[A-Z_]+__')
    Assert-True ".env DATABASE_URL targets throwaway db" ($raw -match [regex]::Escape($dbName))
    Assert-True ".env PORT is $TestPort" ($raw -match "(?m)^PORT=$TestPort\s*$")
    Assert-True ".env BIND_HOST is loopback" ($raw -match "(?m)^BIND_HOST=127\.0\.0\.1\s*$")
    $jwt = if ($raw -match '(?m)^JWT_SECRET="([^"]+)"') { $Matches[1] } else { "" }
    Assert-True ".env JWT_SECRET is 64 chars (48-byte base64)" ($jwt.Length -eq 64) "(len $($jwt.Length))"
  }

  # 4. No client data / dumps copied. The Prisma migration files under
  # backend\prisma\migrations are the schema history, not a data dump, so they
  # are expected to be present.
  Assert-True "no database\ folder copied" (-not (Test-Path (Join-Path $installRoot "database")))
  $dumps = @(Get-ChildItem $installRoot -Recurse -File -Filter "*.sql" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '[\\/]prisma[\\/]migrations[\\/]' })
  Assert-True "no .sql data dump copied" ($dumps.Count -eq 0) "(found $($dumps.Count))"
  $migrations = @(Get-ChildItem (Join-Path $installRoot "backend\prisma\migrations") -Directory -ErrorAction SilentlyContinue)
  Assert-True "Prisma migrations kept (22)" ($migrations.Count -eq 22) "(found $($migrations.Count))"

  # 5. Payload present
  Assert-True "backend\dist copied" (Test-Path (Join-Path $installRoot "backend\dist\index.js"))
  Assert-True "backend\prisma copied" (Test-Path (Join-Path $installRoot "backend\prisma\schema.prisma"))
  Assert-True "frontend\web.config copied" (Test-Path (Join-Path $installRoot "frontend\web.config"))
  Assert-True "ops\ scripts copied" (Test-Path (Join-Path $installRoot "ops\backup.bat"))

  # 6. Site folder flattened (index.html + assets + web.config together)
  $site = Join-Path $installRoot "site"
  Assert-True "site\index.html present" (Test-Path (Join-Path $site "index.html"))
  Assert-True "site\web.config present" (Test-Path (Join-Path $site "web.config"))

  # 7. Schema applied to the throwaway database
  $tableCount = (& $psql -U $PgUser -h $PgHost -p $PgPort -d $dbName -At -c "select count(*) from pg_tables where schemaname='public';" 2>$null | Select-Object -First 1)
  Assert-True "schema applied to throwaway db" ([int]$tableCount -gt 30) "(tables=$tableCount)"

  # 8. API responds on the test port
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$TestPort/api/health" -UseBasicParsing -TimeoutSec 30
    Assert-True "API health returns 200" ($resp.StatusCode -eq 200) "(status $($resp.StatusCode))"
    Assert-True "API health body is ok" ($resp.Content -match '"status"\s*:\s*"ok"')
  } catch {
    Assert-True "API health returns 200" $false "($($_.Exception.Message))"
  }

  # 9. PM2 apps online, under the test's own prefixed names.
  # `pm2 jlist` is not used: PM2 returns the full environment block of every
  # application, which on Windows contains keys that differ only in case
  # (`username` / `USERNAME`). Windows PowerShell 5.1 resolves dictionary keys
  # case-insensitively and ConvertFrom-Json throws "duplicated keys". The text
  # output of `pm2 describe` is used instead.
  $pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
  if (-not $pm2) { $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue }
  function Get-Pm2Status {
    param([string]$Name)
    if (-not $pm2) { return $null }
    $d = (& $pm2.Source describe $Name 2>&1 | Out-String)
    # The escape character is built from its code point: writing it as a
    # literal would depend on how this file is read.
    $d = [regex]::Replace($d, ([string][char]27 + '\[[0-9;?]*[ -/]*[@-~]'), "")
    if ($d -match "doesn't exist") { return $null }
    $line = ($d -split "`r?`n" | Where-Object { $_ -match '\bstatus\b' } | Select-Object -First 1)
    if (-not $line) { return "unknown" }
    if ($line -match 'status[^A-Za-z0-9]*([A-Za-z]+)') {
      $word = $Matches[1]
      if ($word -match '^(online|stopped|errored|launching|launched|created|deleting|zombie|unknown|waiting)$') { return $word }
    }
    return "unknown"
  }
  foreach ($name in $testAppNames) {
    $status = Get-Pm2Status $name
    Assert-True "pm2 has $name" ($null -ne $status)
    if ($status) { Assert-True "pm2 $name is online" ($status -eq "online") "(status $status)" }
  }

  # 10. The live CMMS applications are untouched. The test install used its own
  # application names, so the live ones must still be online and still be
  # serving the live port.
  foreach ($name in @("cmms-api", "cmms-worker")) {
    $status = Get-Pm2Status $name
    Assert-True "live pm2 $name still present" ($null -ne $status)
    if ($status) { Assert-True "live pm2 $name still online" ($status -eq "online") "(status $status)" }
  }
  try {
    $liveResp = Invoke-WebRequest -Uri "http://127.0.0.1:4000/api/health" -UseBasicParsing -TimeoutSec 15
    Assert-True "live API still healthy on 4000" ($liveResp.StatusCode -eq 200) "(status $($liveResp.StatusCode))"
  } catch {
    Assert-True "live API still healthy on 4000" $false "($($_.Exception.Message))"
  }

  # 11. Live database untouched
  $liveCount = (& $psql -U $PgUser -h $PgHost -p $PgPort -d cmms -At -c "select count(*) from pg_tables where schemaname='public';" 2>$null | Select-Object -First 1)
  Assert-True "live cmms schema count unchanged (39)" ([int]$liveCount -eq 39) "(got $liveCount)"
}
finally {
  Write-Host "`n-- cleanup --" -ForegroundColor Cyan
  $env:PM2_HOME = $pm2Home
  $backendDir = Join-Path $installRoot "backend"
  if (Test-Path -LiteralPath $backendDir) {
    Push-Location $backendDir
    # Only the test's own application names are deleted. `pm2 kill` is never
    # used: it would stop every application in the daemon, including the live
    # CMMS.
    try { & pm2 delete @testAppNames 2>&1 | Out-Null } catch {}
    try { & pm2 save 2>&1 | Out-Null } catch {}
    Pop-Location
  }
  $env:PM2_HOME = $null
  $env:CMMS_INSTALLER_TEST_PGPASSWORD = $null
  $env:PGPASSWORD = $PgPassword
  & $psql -U $PgUser -h $PgHost -p $PgPort -c "DROP DATABASE IF EXISTS $dbName;" 2>&1 | Out-Null
  if (-not $KeepArtifacts) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
  else { Write-Host "artifacts kept: $scratch" }
}

Write-Host "`n=== RESULT: $($script:Passes) passed, $($script:Failures.Count) failed ===" -ForegroundColor Cyan
if ($script:Failures.Count -gt 0) {
  $script:Failures | ForEach-Object { Write-Host "  FAILED: $_" -ForegroundColor Red }
  exit 1
}
exit 0