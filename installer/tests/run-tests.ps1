#requires -version 5.1
<#
.SYNOPSIS
  Engine test harness for the CommandPulse CMMS installer.
.DESCRIPTION
  Runs installer/install.ps1 against a THROWAWAY database and a scratch install root,
  then asserts the installer's contract. Never touches the live `cmms` database.

  The installer now registers Windows services, which requires an ELEVATED
  PowerShell window; the harness refuses to run without one rather than failing
  half-way through a full install. Each install uses its own instance prefix, so
  its service names (CommandPulseCMMS<prefix>API/Worker) and watchdog task are
  distinct from the live install's. The harness removes only those names
  afterwards; it never touches the live services.
#>
[CmdletBinding()]
param(
  [string]$SourceBundle = "",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$PgUser = "postgres",
  [string]$PgPassword = "",
  [int]$TestPort = 4111,
  [string]$PrismaEnginesPath = "",
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"
# Registering a Windows service requires an elevated session. Refuse here rather
# than copying the bundle and swapping node_modules only to have SCM reject the
# registration at the very end.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "This harness registers Windows services and must run from an elevated PowerShell window." -ForegroundColor Red
  Write-Host "Right-click PowerShell, choose 'Run as administrator', and run the harness again." -ForegroundColor Red
  exit 2
}
# Native command output is decoded with the console output encoding, which on
# Windows PowerShell 5.1 defaults to the OEM code page and mangles the
# box-drawing characters command output uses. The tools write UTF-8.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$script:Failures = @()
$script:Passes = 0

# The service names an install derives from its instance prefix. This mirrors
# Get-CmmsServiceNames in installer\service\Install-CmmsServices.ps1: non-alphanumeric
# characters are stripped, and a prefixed install gets its own watchdog task.
function Get-TestServiceNames {
  param([string]$Prefix)
  $clean = ""
  if ($Prefix) { $clean = ($Prefix -replace '[^A-Za-z0-9]', '') }
  $watchdog = "CommandPulse CMMS Health Watchdog"
  if ($clean) { $watchdog = "$watchdog $clean" }
  [pscustomobject]@{
    Api      = "CommandPulseCMMS${clean}API"
    Worker   = "CommandPulseCMMS${clean}Worker"
    Watchdog = $watchdog
  }
}

function Assert-True {
  param([string]$Name, [bool]$Condition, [string]$Detail = "")
  if ($Condition) { $script:Passes++; Write-Host "  PASS  $Name" -ForegroundColor Green }
  else { $script:Failures += "$Name $Detail"; Write-Host "  FAIL  $Name $Detail" -ForegroundColor Red }
  $verdict = if ($Condition) { "PASS" } else { "FAIL" }
  Write-Summary "$verdict $Name $Detail"
}

function Get-PsqlPath {
  $c = Get-Command psql -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("C:\Program Files\PostgreSQL\18\bin\psql.exe","C:\Program Files\PostgreSQL\17\bin\psql.exe","C:\Program Files\PostgreSQL\16\bin\psql.exe","C:\Program Files\PostgreSQL\15\bin\psql.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Test-PortFree {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(1000)) { return $true }
    $client.EndConnect($iar)
    return $false
  } catch {
    return $true
  } finally {
    try { $client.Close() } catch { }
  }
}

function Get-FreePort {
  param([int]$Start)
  for ($p = $Start; $p -lt ($Start + 100); $p++) {
    if (Test-PortFree $p) { return $p }
  }
  throw "No free TCP port found from $Start"
}

# Get-Service returns a ServiceController whose StartType property is not
# available on every PowerShell 5.1 host, and it cannot report the account.
# Win32_Service reports state, start mode, account and the wrapper pid in one
# object, so all service assertions read from there.
function Get-ServiceInfo {
  param([string]$Name)
  $wmi = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $Name) -ErrorAction SilentlyContinue
  if (-not $wmi) { return $null }
  [pscustomobject]@{
    Name      = $Name
    State     = [string]$wmi.State
    StartMode = [string]$wmi.StartMode
    Account   = [string]$wmi.StartName
    Pid       = [int]$wmi.ProcessId
    PathName  = [string]$wmi.PathName
  }
}

# The pid that actually owns the listening socket. With WinSW this is the
# node.exe child, not the wrapper pid Win32_Service reports.
function Get-ListenerPid {
  param([int]$Port)
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
  }
  $line = (& netstat -ano 2>$null | Select-String -Pattern (":{0}\s" -f $Port) | Select-Object -First 1)
  if ($line -and $line.Line -match 'LISTENING\s+(\d+)') { return [int]$Matches[1] }
  return $null
}

# True when $ChildPid is $AncestorPid or a descendant of it. The wrapper starts
# node.exe, so the listener's parent chain is the only ownership proof: the
# wrapper pid and the listener pid are deliberately different.
function Test-DescendantOf {
  param([int]$ChildPid, [int]$AncestorPid, [int]$MaxDepth = 8)
  $cursor = $ChildPid
  for ($i = 0; $i -lt $MaxDepth -and $cursor -gt 0; $i++) {
    if ($cursor -eq $AncestorPid) { return $true }
    $proc = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $cursor) -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    $cursor = [int]$proc.ParentProcessId
  }
  return $false
}

# Runs the service script as a child process, the same way the engine does.
# Cleanup must never throw: it runs from finally, and one leftover service is
# not a reason to skip dropping the throwaway databases.
function Invoke-ServiceScript {
  param([string]$Mode, [string]$Prefix = "", [int]$Port = 0)
  $powershell = Join-Path $env:windir "System32\WindowsPowerShell\v1.0\powershell.exe"
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $serviceScript, "-Mode", $Mode)
  if ($Prefix) { $argList += @("-ServicePrefix", $Prefix) }
  if ($Port -gt 0) { $argList += @("-ApiPort", [string]$Port) }
  try {
    & $powershell @argList 2>&1 | ForEach-Object { Write-Host "  [service $Mode] $_" }
    if ($LASTEXITCODE -ne 0) { Write-Host "  [service $Mode] exited $LASTEXITCODE" -ForegroundColor Yellow }
  } catch {
    Write-Host "  [service $Mode] failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$engine = Join-Path $repoRoot "installer\install.ps1"
$serviceScript = Join-Path $repoRoot "installer\service\Install-CmmsServices.ps1"
if (-not (Test-Path -LiteralPath $serviceScript)) {
  throw "The service script was not found at $serviceScript. The harness asserts the service contract, so it cannot run without it."
}
if (-not $SourceBundle) {
  # The published bundle is distributed beside the repository checkout, so the
  # default is the newest sibling bundle that is actually present, not a
  # developer-machine path or a version that has to be edited each release.
  $parent = Split-Path -Parent $repoRoot
  $candidates = @(Get-ChildItem -LiteralPath $parent -Directory -Filter "CommandPulse-CMMS-v*" -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Name -replace '^CommandPulse-CMMS-v', '') } -Descending)
  if ($candidates.Count -gt 0) { $SourceBundle = $candidates[0].FullName }
}
if (-not $SourceBundle) {
  throw "No -SourceBundle supplied and no bundle found beside the repository. Pass -SourceBundle explicitly."
}
if (-not $PrismaEnginesPath) {
  # Default to the engines already downloaded in this repository's own
  # node_modules, so the test does not depend on binaries.prisma.sh.
  $candidate = Join-Path $repoRoot "backend\node_modules\.prisma\client"
  if (Test-Path -LiteralPath $candidate) { $PrismaEnginesPath = $candidate }
}
$scratch = Join-Path $env:TEMP ("cmms-installer-test-" + (Get-Date -Format "yyyyMMddHHmmss"))
# The install root contains a space on purpose. The live root is
# "…\Default Project\CMMSproject", and a path that splits on the space is exactly
# what made the 2026-11-01 upgrade delete a healthy application and fail to
# start its replacement (D2). Every harness run now covers that shape.
$installRoot = Join-Path $scratch "install root"
$pm2Home = Join-Path $scratch "pm2-home"
$dbName = "cmms_installer_test_" + (Get-Random)
# Database-policy cases (I-27). They are declared here, before the try block, so
# the finally clause can always drop them even if an assertion throws.
$foreignDb = "cmms_installer_foreign_" + (Get-Random)
$emptyDb = "cmms_installer_empty_" + (Get-Random)
$policyRoot = Join-Path $scratch "policy-install"
$policyPrefix = "cmmspol" + (Get-Random -Minimum 100000 -Maximum 999999) + "-"

# The folder a web server would serve. It is deliberately NOT the install root's
# site\ folder, and it starts with a web.config of its own: the deploy step has to
# replace the compiled files and leave the host's proxy binding alone (D6). No IIS
# site is involved, so the harness works on any host - it passes -SitePath.
$siteTarget = Join-Path $scratch "iis site"
New-Item -ItemType Directory -Force -Path $siteTarget | Out-Null
$siteWebConfig = Join-Path $siteTarget "web.config"
$siteWebConfigBody = '<?xml version="1.0" encoding="utf-8"?>' + "`r`n" + '<configuration><!-- this host'+"'"+'s proxy binding --></configuration>' + "`r`n"
[System.IO.File]::WriteAllText($siteWebConfig, $siteWebConfigBody)

# The first-Administrator contract. A random password keeps the "not in the log"
# assertion meaningful; the fixed username and email make the database row and
# the sign-in assertion unambiguous.
$adminUsername = "installeradmin"
$adminFullName = "Installer Administrator"
$adminEmail = "installeradmin@example.test"
$adminPassword = "Adm1n-" + [guid]::NewGuid().ToString("N").Substring(0, 12) + "!"
$adminFile = Join-Path $scratch "admin.json"
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$adminJson = @{ username = $adminUsername; fullName = $adminFullName; email = $adminEmail; password = $adminPassword } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($adminFile, $adminJson, (New-Object System.Text.UTF8Encoding($false)))

# The engine logs to %ProgramData%\CommandPulse\logs. The harness writes its
# verdict next to those logs: a PASS/FAIL line printed to a console is not
# evidence once the window closes. The throwaway database name is recorded in
# the first block so the verdict and the engine log can be tied together.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryRoot = if ($env:ProgramData) { Join-Path $env:ProgramData "CommandPulse\logs" } else { $scratch }
New-Item -ItemType Directory -Force -Path $summaryRoot | Out-Null
$script:SummaryFile = Join-Path $summaryRoot "installer-test-$stamp.log"
function Write-Summary {
  param([string]$Line)
  try { Add-Content -LiteralPath $script:SummaryFile -Value $Line -Encoding UTF8 } catch { }
}

# A unique instance prefix. It keeps this run's Windows services
# (CommandPulseCMMS<prefix>API/Worker) and its watchdog task distinct from the
# live install's. The harness removes only those names.
$appPrefix = "cmmstest" + (Get-Random -Minimum 100000 -Maximum 999999) + "-"
$testServices = Get-TestServiceNames -Prefix $appPrefix
$policyServices = Get-TestServiceNames -Prefix $policyPrefix

Write-Host "=== CommandPulse CMMS installer engine tests ===" -ForegroundColor Cyan
Write-Host "scratch : $scratch"
Write-Host "database: $dbName (throwaway)"
Write-Host "summary : $script:SummaryFile"

Write-Summary "=== CommandPulse CMMS installer engine tests ==="
Write-Summary "started   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Summary "scratch   : $scratch"
Write-Summary "database  : $dbName (throwaway)"
Write-Summary "instance  : $appPrefix"
Write-Summary "bundle    : $SourceBundle"
Write-Summary "port      : $TestPort"
Write-Summary "admin     : $adminUsername (password not recorded)"

$psql = Get-PsqlPath
if (-not $psql) { Write-Summary "ERROR: psql not found"; throw "psql not found" }
if (-not $PgPassword) { $PgPassword = $env:PGPASSWORD }
if (-not $PgPassword) { Write-Summary "ERROR: no PostgreSQL password supplied"; throw "No PostgreSQL password supplied (-PgPassword or PGPASSWORD env)" }

# An isolated PM2_HOME relocates PM2's logs and dump.pm2. It does NOT create a
# second daemon, so it is not isolation on its own.
$env:PM2_HOME = $pm2Home
New-Item -ItemType Directory -Force -Path $pm2Home | Out-Null

$env:PGPASSWORD = $PgPassword
# The throwaway database is deliberately NOT created here. The engine creates an
# absent database itself (I-27), and the install below is the proof: if the
# engine cannot create it, the first assertion fails.

try {
  Write-Host "`n-- running engine (full) --" -ForegroundColor Cyan
  # The password is passed through an environment variable, never as a command
  # line argument, so it cannot be read from the process list.
  $env:CMMS_INSTALLER_TEST_PGPASSWORD = $PgPassword
  & $engine -SourceBundle $SourceBundle -InstallRoot $installRoot `
    -PgHost $PgHost -PgPort $PgPort -PgUser $PgUser -PgPasswordEnv "CMMS_INSTALLER_TEST_PGPASSWORD" `
    -DbName $dbName -ApiPort $TestPort -SiteName "cmms.test.local" -SitePath $siteTarget `
    -AppNamePrefix $appPrefix -PrismaEnginesPath $PrismaEnginesPath `
    -AdminFile $adminFile -Mode full
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

  # 6b. The folder the web server actually serves was updated (D6). Before this
  # step an upgrade replaced the backend and left the live site on its old build.
  Assert-True "frontend deployed to the web server target" (Test-Path (Join-Path $siteTarget "index.html"))
  if (Test-Path (Join-Path $siteTarget "index.html")) {
    Assert-True "deployed index.html matches the install's site\index.html" (
      (Get-FileHash (Join-Path $siteTarget "index.html") -Algorithm SHA256).Hash -eq
      (Get-FileHash (Join-Path $site "index.html") -Algorithm SHA256).Hash)
    $deployedAssets = @(Get-ChildItem (Join-Path $siteTarget "assets") -File -ErrorAction SilentlyContinue)
    $bundleAssets = @(Get-ChildItem (Join-Path $site "assets") -File -ErrorAction SilentlyContinue)
    Assert-True "deployed assets match the bundle's ($($bundleAssets.Count))" ($deployedAssets.Count -eq $bundleAssets.Count) "(deployed $($deployedAssets.Count), bundle $($bundleAssets.Count))"
  }
  Assert-True "site deploy preserved the host's own web.config" (
    (Test-Path $siteWebConfig) -and ([System.IO.File]::ReadAllText($siteWebConfig) -eq $siteWebConfigBody))

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

  # 8b. First Administrator: the row exists, the hash is bcrypt, and the
  # account can actually sign in. A blank database with no user is the gap this
  # step exists to close, so "the installer exited 0" is not enough.
  # Quoted identifiers (the table is "User") cannot be sent with -c: Windows
  # PowerShell 5.1 strips embedded double quotes from native command arguments.
  # The SQL is piped to psql on stdin instead, where nothing rewrites it.
  function Invoke-ThrowawaySql {
    param([string]$Sql)
    return ($Sql | & $psql -U $PgUser -h $PgHost -p $PgPort -d $dbName -At 2>$null | Select-Object -First 1)
  }
  $adminRows = Invoke-ThrowawaySql "select count(*) from ""User"" where lower(username) = lower('$adminUsername') and role = 'Administrator' and ""isDeleted"" = false;"
  Assert-True "first Administrator row exists" ([int]$adminRows -eq 1) "(rows=$adminRows)"
  $hashPrefix = Invoke-ThrowawaySql "select left(""passwordHash"", 4) from ""User"" where lower(username) = lower('$adminUsername');"
  Assert-True "Administrator password is bcrypt" ($hashPrefix -eq '$2a$' -or $hashPrefix -eq '$2b$') "(prefix=$hashPrefix)"
  Assert-True "Administrator file deleted by the engine" (-not (Test-Path -LiteralPath $adminFile))

  $loginBody = @{ username = $adminUsername; password = $adminPassword } | ConvertTo-Json -Compress
  try {
    $login = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$TestPort/api/auth/login" -Body $loginBody -ContentType "application/json" -TimeoutSec 30
    Assert-True "Administrator sign-in returns a token" ([bool]$login.token)
    Assert-True "Administrator sign-in reports the Administrator role" ($login.user.role -eq "Administrator")
  } catch {
    Assert-True "Administrator sign-in returns a token" $false "($($_.Exception.Message))"
  }
  $badStatus = 0
  try {
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$TestPort/api/auth/login" -Body (@{ username = $adminUsername; password = "wrong-" + $adminPassword } | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 30 | Out-Null
  } catch {
    $badStatus = [int]$_.Exception.Response.StatusCode
  }
  Assert-True "wrong password is rejected with 401" ($badStatus -eq 401) "(status $badStatus)"

  # 8c. The secret never reaches the install log.
  $engineLog = Get-ChildItem (Join-Path $env:ProgramData "CommandPulse\logs") -Filter "install-*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime | Select-Object -Last 1
  if ($engineLog) {
    $logText = [System.IO.File]::ReadAllText($engineLog.FullName)
    Assert-True "Administrator password absent from install log" (-not $logText.Contains($adminPassword))
    Assert-True "install log records the Administrator step" ($logText -match "First Administrator") "(log $($engineLog.Name))"
    Assert-True "install log records creation success" ($logText -match "First Administrator '$adminUsername' created")
  } else {
    Assert-True "install log found" $false
  }

  # 9. Both Windows services exist, are Running and Automatic, and the API's
  # listener is a descendant of the service wrapper. The wrapper pid reported by
  # Win32_Service is NOT the listener: WinSW starts node.exe as a child, so
  # ownership is proved by walking the listener's parent chain.
  foreach ($id in @($testServices.Api, $testServices.Worker)) {
    $info = Get-ServiceInfo $id
    Assert-True "service $id exists" ($null -ne $info)
    if ($info) {
      Assert-True "service $id is Running" ($info.State -eq "Running") "(state $($info.State))"
      Assert-True "service $id starts automatically" ($info.StartMode -eq "Auto") "(start mode $($info.StartMode))"
      Assert-True "service $id runs as LocalSystem" ($info.Account -ieq "LocalSystem" -or $info.Account -ieq "NT AUTHORITY\SYSTEM") "(account $($info.Account))"
    }
  }
  $listenerPid = Get-ListenerPid -Port $TestPort
  Assert-True "test port $TestPort is listening" ($null -ne $listenerPid)
  $apiInfo = Get-ServiceInfo $testServices.Api
  if ($apiInfo -and $listenerPid) {
    Assert-True "the API service owns the listener on $TestPort" (Test-DescendantOf -ChildPid $listenerPid -AncestorPid $apiInfo.Pid) "(wrapper $($apiInfo.Pid), listener $listenerPid)"
    $listener = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $listenerPid) -ErrorAction SilentlyContinue
    Assert-True "the listener is node.exe" ($listener -and $listener.Name -eq "node.exe") "(name $(if ($listener) { $listener.Name } else { 'gone' }))"
  }
  $watchdog = Get-ScheduledTask -TaskName $testServices.Watchdog -ErrorAction SilentlyContinue
  Assert-True "watchdog task '$($testServices.Watchdog)' is registered" ($null -ne $watchdog)
  if ($watchdog) {
    Assert-True "watchdog task is not disabled" ($watchdog.State -ne "Disabled") "(state $($watchdog.State))"
  }

  # 10. The live CMMS is untouched. The test used its own service names, so the
  # only facts to assert are the ones a shared resource could break: the live
  # API still answers on 4000 and the live database still has its 39 tables
  # (asserted in section 11).
  try {
    $liveResp = Invoke-WebRequest -Uri "http://127.0.0.1:4000/api/health" -UseBasicParsing -TimeoutSec 15
    Assert-True "live API still healthy on 4000" ($liveResp.StatusCode -eq 200) "(status $($liveResp.StatusCode))"
  } catch {
    Assert-True "live API still healthy on 4000" $false "($($_.Exception.Message))"
  }

  # 11. Live database untouched
  $liveCount = (& $psql -U $PgUser -h $PgHost -p $PgPort -d cmms -At -c "select count(*) from pg_tables where schemaname='public';" 2>$null | Select-Object -First 1)
  Assert-True "live cmms schema count unchanged (39)" ([int]$liveCount -eq 39) "(got $liveCount)"

  # 12. Database-state policy (I-27). The engine classifies the target before it
  # copies any file, so a refusal is cheap: nothing is copied, nothing is
  # migrated, and the exit code is 4. Every database used here is throwaway.
  $policyPort = Get-FreePort 4151
  $upgradePort = Get-FreePort ($policyPort + 1)
  $probeEnv = "CMMS_INSTALLER_TEST_PGPASSWORD"

  # 12a. The install above started with no database at all and exited 0, which is
  # the proof that an absent target is created. Confirm the row exists.
  $dbExists = (& $psql -U $PgUser -h $PgHost -p $PgPort -d postgres -At -c "SELECT count(*) FROM pg_database WHERE datname = '$dbName';" 2>$null | Select-Object -First 1)
  Assert-True "engine created the absent throwaway database" ([int]$dbExists -eq 1) "(count=$dbExists)"

  # 12b. Probe classifies a migrated database.
  $probeOut = Join-Path $scratch "probe-cp.json"
  & $engine -Mode probe -DbName $dbName -ProbeOut $probeOut -PgPasswordEnv $probeEnv
  Assert-True "probe exits 0" ($LASTEXITCODE -eq 0) "(exit $LASTEXITCODE)"
  $probeCp = if (Test-Path $probeOut) { Get-Content $probeOut -Raw | ConvertFrom-Json } else { $null }
  Assert-True "probe reports a CommandPulse database" ($probeCp -and $probeCp.kind -eq "CommandPulse") "(kind=$(if ($probeCp) { $probeCp.kind } else { 'none' }))"

  # 12c. An existing CommandPulse database is refused without the switch, and the
  # refusal leaves the migration history and the install root untouched.
  $migBefore = Invoke-ThrowawaySql 'select count(*) from "_prisma_migrations";'
  & $engine -SourceBundle $SourceBundle -InstallRoot $policyRoot `
    -PgHost $PgHost -PgPort $PgPort -PgUser $PgUser -PgPasswordEnv $probeEnv `
    -DbName $dbName -ApiPort $policyPort -SiteName "cmms.policy.local" `
    -AppNamePrefix $policyPrefix -PrismaEnginesPath $PrismaEnginesPath -Mode full
  Assert-True "existing CommandPulse database refused without -AllowExistingDatabase" ($LASTEXITCODE -eq 4) "(exit $LASTEXITCODE)"
  Assert-True "refusal copied no files" (-not (Test-Path -LiteralPath $policyRoot))
  $migAfterRefusal = Invoke-ThrowawaySql 'select count(*) from "_prisma_migrations";'
  Assert-True "refusal left the migration history unchanged" ("$migBefore" -eq "$migAfterRefusal") "(before=$migBefore after=$migAfterRefusal)"

  # 12d. A foreign database is refused even with the switch, and its table survives.
  & $psql -U $PgUser -h $PgHost -p $PgPort -d postgres -c "CREATE DATABASE $foreignDb;" | Out-Null
  & $psql -U $PgUser -h $PgHost -p $PgPort -d $foreignDb -c "CREATE TABLE keepme (id int);" | Out-Null
  $probeForeignOut = Join-Path $scratch "probe-foreign.json"
  & $engine -Mode probe -DbName $foreignDb -ProbeOut $probeForeignOut -PgPasswordEnv $probeEnv
  $probeForeign = if (Test-Path $probeForeignOut) { Get-Content $probeForeignOut -Raw | ConvertFrom-Json } else { $null }
  Assert-True "probe reports a foreign database" ($probeForeign -and $probeForeign.kind -eq "Foreign") "(kind=$(if ($probeForeign) { $probeForeign.kind } else { 'none' }))"
  & $engine -SourceBundle $SourceBundle -InstallRoot $policyRoot `
    -PgHost $PgHost -PgPort $PgPort -PgUser $PgUser -PgPasswordEnv $probeEnv `
    -DbName $foreignDb -ApiPort $policyPort -SiteName "cmms.policy.local" `
    -AppNamePrefix $policyPrefix -PrismaEnginesPath $PrismaEnginesPath -Mode full -AllowExistingDatabase
  Assert-True "foreign database refused even with -AllowExistingDatabase" ($LASTEXITCODE -eq 4) "(exit $LASTEXITCODE)"
  $keep = (& $psql -U $PgUser -h $PgHost -p $PgPort -d $foreignDb -At -c "SELECT to_regclass('public.keepme') IS NOT NULL;" 2>$null | Select-Object -First 1)
  Assert-True "foreign table untouched after refusal" ("$keep" -eq "t") "(got $keep)"

  # 12e. An empty database is classified as Empty (migrated in place, no refusal).
  & $psql -U $PgUser -h $PgHost -p $PgPort -d postgres -c "CREATE DATABASE $emptyDb;" | Out-Null
  $probeEmptyOut = Join-Path $scratch "probe-empty.json"
  & $engine -Mode probe -DbName $emptyDb -ProbeOut $probeEmptyOut -PgPasswordEnv $probeEnv
  $probeEmpty = if (Test-Path $probeEmptyOut) { Get-Content $probeEmptyOut -Raw | ConvertFrom-Json } else { $null }
  Assert-True "probe reports an empty database" ($probeEmpty -and $probeEmpty.kind -eq "Empty") "(kind=$(if ($probeEmpty) { $probeEmpty.kind } else { 'none' }))"

  # 12f. With the switch, an existing CommandPulse database is upgraded and the
  # migration history is idempotent. This is a second full install against a
  # separate root, prefix and port, so the first install is not disturbed.
  & $engine -SourceBundle $SourceBundle -InstallRoot $policyRoot `
    -PgHost $PgHost -PgPort $PgPort -PgUser $PgUser -PgPasswordEnv $probeEnv `
    -DbName $dbName -ApiPort $upgradePort -SiteName "cmms.policy.local" `
    -AppNamePrefix $policyPrefix -PrismaEnginesPath $PrismaEnginesPath -Mode full -AllowExistingDatabase
  Assert-True "existing CommandPulse database upgraded with -AllowExistingDatabase" ($LASTEXITCODE -eq 0) "(exit $LASTEXITCODE)"
  $migAfterUpgrade = Invoke-ThrowawaySql 'select count(*) from "_prisma_migrations";'
  Assert-True "upgrade left the migration history unchanged" ("$migBefore" -eq "$migAfterUpgrade") "(before=$migBefore after=$migAfterUpgrade)"
  Assert-True "policy install created its own site folder" (Test-Path (Join-Path $policyRoot "site\index.html"))

  # 13. In-place upgrade (D2/D3/D4/D5/D6). A second full pass against the SAME
  # root, port and instance prefix, with the services RUNNING. That is the shape
  # of a real upgrade and the only shape in which the 2026-11-01 defects appear:
  # an unquoted path, a .env deleted before it could be backed up, a *.sql sweep
  # that ate the operator's dumps, a dependency install that cannot run against a
  # live tree, and a frontend left behind on the web server.
  Write-Host "`n-- in-place upgrade pass --" -ForegroundColor Cyan
  $envBefore = [System.IO.File]::ReadAllText($envFile)
  $jwtBefore = if ($envBefore -match '(?m)^JWT_SECRET="([^"]+)"') { $Matches[1] } else { "" }
  Assert-True "pre-upgrade .env has a 64-char JWT secret" ($jwtBefore.Length -eq 64) "(len $($jwtBefore.Length))"
  $pidBefore = @{}
  foreach ($id in @($testServices.Api, $testServices.Worker)) {
    $info = Get-ServiceInfo $id
    $pidBefore[$id] = if ($info) { $info.Pid } else { $null }
  }

  # D4 material: a dump and a database\ folder that did NOT come from the bundle.
  # The old sweep deleted every *.sql under the install root and the whole
  # database\ folder; on 2026-11-01 that removed the production backups.
  $backupsDir = Join-Path $installRoot "backups"
  New-Item -ItemType Directory -Force -Path $backupsDir | Out-Null
  $keepDump = Join-Path $backupsDir "cmms-operator-dump.sql"
  [System.IO.File]::WriteAllText($keepDump, "-- an operator dump; an install must not remove it`n")
  $keepDatabaseDir = Join-Path $installRoot "database"
  New-Item -ItemType Directory -Force -Path $keepDatabaseDir | Out-Null
  $keepDatabaseFile = Join-Path $keepDatabaseDir "operator.txt"
  [System.IO.File]::WriteAllText($keepDatabaseFile, "not from the bundle`n")

  # Continuity is measured, not asserted: health is polled every 250 ms for the
  # whole upgrade. The gap must be the directory swap (seconds), not the
  # dependency install (minutes), which is what an in-place `npm ci` would cause.
  $pollFile = Join-Path $scratch "health-poll.txt"
  $stopFile = Join-Path $scratch "health-poll.stop"
  Remove-Item -LiteralPath $pollFile, $stopFile -Force -ErrorAction SilentlyContinue
  $pollJob = Start-Job -ArgumentList $TestPort, $pollFile, $stopFile -ScriptBlock {
    param($Port, $Out, $Stop)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-Content -LiteralPath $Out -Value "started"
    $last = $true
    while (-not (Test-Path -LiteralPath $Stop)) {
      $ok = $false
      try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 4
        $ok = ($r.StatusCode -eq 200)
      } catch { $ok = $false }
      if ($ok -ne $last) {
        $word = if ($ok) { "UP" } else { "DOWN" }
        Add-Content -LiteralPath $Out -Value ("{0:0.00} {1}" -f $sw.Elapsed.TotalSeconds, $word)
        $last = $ok
      }
      Start-Sleep -Milliseconds 250
    }
    Add-Content -LiteralPath $Out -Value ("{0:0.00} END" -f $sw.Elapsed.TotalSeconds)
  }
  $waitStart = Get-Date
  while (-not (Test-Path -LiteralPath $pollFile) -and ((New-TimeSpan -Start $waitStart).TotalSeconds -lt 30)) { Start-Sleep -Milliseconds 200 }
  Assert-True "health poller started before the upgrade" (Test-Path -LiteralPath $pollFile)

  $upgradeExit = -1
  try {
    & $engine -SourceBundle $SourceBundle -InstallRoot $installRoot `
      -PgHost $PgHost -PgPort $PgPort -PgUser $PgUser -PgPasswordEnv "CMMS_INSTALLER_TEST_PGPASSWORD" `
      -DbName $dbName -ApiPort $TestPort -SiteName "cmms.test.local" -SitePath $siteTarget `
      -AppNamePrefix $appPrefix -PrismaEnginesPath $PrismaEnginesPath `
      -Mode full -AllowExistingDatabase
    $upgradeExit = $LASTEXITCODE
  } finally {
    New-Item -ItemType File -Force -Path $stopFile | Out-Null
    try { Wait-Job $pollJob -Timeout 60 | Out-Null } catch { }
    try { Receive-Job $pollJob -ErrorAction SilentlyContinue | Out-Null; Remove-Job $pollJob -Force } catch { }
  }
  Assert-True "in-place upgrade exits 0" ($upgradeExit -eq 0) "(exit $upgradeExit)"

  # 13a. The operator's data survived the upgrade (D4).
  Assert-True "operator dump in backups\ survived the upgrade" (Test-Path -LiteralPath $keepDump)
  Assert-True "operator dump content is unchanged" (
    (Test-Path -LiteralPath $keepDump) -and
    ([System.IO.File]::ReadAllText($keepDump) -eq "-- an operator dump; an install must not remove it`n"))
  Assert-True "operator database\ folder survived the upgrade" (Test-Path -LiteralPath $keepDatabaseFile)

  # 13b. The previous .env was backed up before it was rewritten (D3), the copy
  # holds the OLD secret, and the new .env holds a different one.
  $backendDir = Join-Path $installRoot "backend"
  $envBackups = @(Get-ChildItem -LiteralPath $backendDir -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like ".env.bak.*" })
  Assert-True "upgrade left a .env.bak.<stamp> copy" ($envBackups.Count -ge 1) "(found $($envBackups.Count))"
  $savedOldSecret = $false
  foreach ($b in $envBackups) {
    if ([System.IO.File]::ReadAllText($b.FullName).Contains($jwtBefore)) { $savedOldSecret = $true }
  }
  Assert-True "the .env backup holds the previous JWT secret" $savedOldSecret
  $envAfter = [System.IO.File]::ReadAllText($envFile)
  $jwtAfter = if ($envAfter -match '(?m)^JWT_SECRET="([^"]+)"') { $Matches[1] } else { "" }
  Assert-True ".env was rewritten with a fresh JWT secret" ($jwtAfter.Length -eq 64 -and $jwtAfter -ne $jwtBefore)
  if ($envBackups.Count -ge 1) {
    $bakAcl = Get-Acl -LiteralPath $envBackups[0].FullName
    $bakTrustees = @($bakAcl.Access | ForEach-Object { $_.IdentityReference.Value })
    $me2 = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $bakExpected = @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators", $me2)
    $bakExtra = @($bakTrustees | Where-Object { $bakExpected -notcontains $_ })
    Assert-True ".env backup ACL is protected" $bakAcl.AreAccessRulesProtected
    Assert-True ".env backup ACL has no extra trustees" ($bakExtra.Count -eq 0) "(extra: $($bakExtra -join ', '))"
  }

  # 13c. The dependency install was staged and the stage was cleaned up (D5).
  Assert-True "no .install-stage left behind" (-not (Test-Path -LiteralPath (Join-Path $backendDir ".install-stage")))
  $previousTrees = @(Get-ChildItem -LiteralPath $backendDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "node_modules.previous-*" })
  Assert-True "previous node_modules removed after a healthy start" ($previousTrees.Count -eq 0) "(found $($previousTrees.Count))"
  Assert-True "express is installed in the upgraded tree" (Test-Path (Join-Path $backendDir "node_modules\express\package.json"))

  # 13d. The service was restarted in place, not unregistered and registered
  # again (D2), and its wrapper still lives in THIS install's backend\service.
  $apiName = $testServices.Api
  $apiInfo = Get-ServiceInfo $apiName
  Assert-True "service $apiName is Running after the upgrade" ($apiInfo -and $apiInfo.State -eq "Running") "(state $(if ($apiInfo) { $apiInfo.State } else { 'missing' }))"
  $pidAfter = if ($apiInfo) { $apiInfo.Pid } else { $null }
  Assert-True "service $apiName was restarted (new wrapper pid)" (
    $pidAfter -and $pidBefore[$apiName] -and $pidAfter -ne $pidBefore[$apiName]) "(before $($pidBefore[$apiName]), after $pidAfter)"
  $expectedWrapper = Join-Path $backendDir ("service\{0}.exe" -f $apiName)
  $qc = (& sc.exe qc $apiName 2>&1 | Out-String)
  Assert-True "service $apiName runs this install's wrapper" (
    (Test-Path -LiteralPath $expectedWrapper) -and $qc -match [regex]::Escape($expectedWrapper)) "(expected '$expectedWrapper')"

  $upgradeLog = @(Get-ChildItem (Join-Path $env:ProgramData "CommandPulse\logs") -Filter "install-*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime | Select-Object -Last 1)
  if ($upgradeLog.Count -eq 1) {
    $upgradeText = [System.IO.File]::ReadAllText($upgradeLog[0].FullName)
    Assert-True "upgrade log shows a staged dependency install" ($upgradeText -match "Staging dependencies in")
    Assert-True "upgrade log shows the frontend deployment" ($upgradeText -match "Frontend deployed to")
    Assert-True "upgrade log shows the database upgrade" ($upgradeText -match "UPGRADE database")
    Assert-True "upgrade log shows the Windows service registration" ($upgradeText -match "Registering the Windows services")
  }

  # 13e. The web server's folder was brought to the new build, and its own
  # web.config was left alone (D6).
  Assert-True "upgrade redeployed the frontend" (
    (Get-FileHash (Join-Path $siteTarget "index.html") -Algorithm SHA256).Hash -eq
    (Get-FileHash (Join-Path $site "index.html") -Algorithm SHA256).Hash)
  Assert-True "upgrade preserved the host's own web.config" (
    (Test-Path $siteWebConfig) -and ([System.IO.File]::ReadAllText($siteWebConfig) -eq $siteWebConfigBody))

  # 13f. Continuity: measure the longest window in which health did not answer.
  $events = @(Get-Content -LiteralPath $pollFile -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^([0-9.]+) (UP|DOWN|END)$' } |
    ForEach-Object {
      $null = $_ -match '^([0-9.]+) (UP|DOWN|END)$'
      [pscustomobject]@{ At = [double]$Matches[1]; State = $Matches[2] }
    })
  Assert-True "health poller recorded the upgrade window" ($events.Count -ge 2) "(events $($events.Count))"
  $maxGap = 0.0
  $downAt = $null
  foreach ($e in $events) {
    if ($e.State -eq "DOWN") { $downAt = $e.At }
    elseif ($null -ne $downAt) {
      $gap = $e.At - $downAt
      if ($gap -gt $maxGap) { $maxGap = $gap }
      $downAt = $null
    }
  }
  Assert-True "service gap stayed under 30 s (the swap, not the install)" ($maxGap -lt 30) ("(gap {0:0.0} s)" -f $maxGap)
  try {
    $afterResp = Invoke-WebRequest -Uri "http://127.0.0.1:$TestPort/api/health" -UseBasicParsing -TimeoutSec 15
    Assert-True "API healthy after the upgrade" ($afterResp.StatusCode -eq 200) "(status $($afterResp.StatusCode))"
  } catch {
    Assert-True "API healthy after the upgrade" $false "($($_.Exception.Message))"
  }
  Write-Summary ("upgrade   : exit {0}, longest gap {1:0.0} s, .env backups {2}" -f $upgradeExit, $maxGap, $envBackups.Count)
}
catch {
  Write-Summary "ERROR: $($_.Exception.Message)"
  Write-Host "summary : $script:SummaryFile"
  throw
}
finally {
  Write-Host "`n-- cleanup --" -ForegroundColor Cyan
  $env:PM2_HOME = $pm2Home

  # Remove the Windows services this run registered. The service script is run as
  # a child process (never dot-sourced) and -Mode remove also deletes the
  # per-instance watchdog task. Only this run's prefixes are named, so the live
  # services are never touched.
  Invoke-ServiceScript -Mode remove -Prefix $appPrefix -Port $TestPort
  Invoke-ServiceScript -Mode remove -Prefix $policyPrefix

  # A 1.6.x install may still have PM2 entries for these names. Only the test's
  # own names would be deleted; `pm2 kill` is never used because it would stop
  # every application in the daemon, including the live CMMS.
  #
  # Nothing to delete here in practice: the engine registers Windows services,
  # never PM2 applications, and the prefixes are unique to this run, so no other
  # install can own them. A blind `pm2 delete` of a name that does not exist
  # prints "[PM2][ERROR] Process or Namespace ... not found" on stderr, which
  # Windows PowerShell turns into a TerminatingError under `Stop`; the earlier
  # version of this block therefore filled the transcript with failures that were
  # not failures. The engine's own legacy handling (below, in the upgrade test)
  # covers a real 1.6.x pair that shares this install's prefix.
  $env:PM2_HOME = $null
  $env:CMMS_INSTALLER_TEST_PGPASSWORD = $null
  $env:PGPASSWORD = $PgPassword
  foreach ($throwaway in @($dbName, $foreignDb, $emptyDb)) {
    & $psql -U $PgUser -h $PgHost -p $PgPort -c "DROP DATABASE IF EXISTS $throwaway;" 2>&1 | Out-Null
  }
  if (-not $KeepArtifacts) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
  else { Write-Host "artifacts kept: $scratch" }
}

Write-Host "`n=== RESULT: $($script:Passes) passed, $($script:Failures.Count) failed ===" -ForegroundColor Cyan
Write-Summary "finished  : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Summary "RESULT: $($script:Passes) passed, $($script:Failures.Count) failed"
Write-Host "summary : $script:SummaryFile"
if ($script:Failures.Count -gt 0) {
  $script:Failures | ForEach-Object { Write-Host "  FAILED: $_" -ForegroundColor Red }
  exit 1
}
exit 0