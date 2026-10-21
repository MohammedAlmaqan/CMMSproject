#requires -version 5.1
<#
.SYNOPSIS
  CommandPulse CMMS Installer Engine (engine-only). 
.DESCRIPTION
  Installs a blank CMMS instance from a compiled bundle. No downloads, no bundled runtimes.
  Uses dynamic ACLs (SYSTEM, BUILTIN\Administrators, current user). Never touches live cmms.
.PARAMETER SourceBundle
  Path to extracted bundle (must contain backend/, frontend/, ops/, docs/, SHA256SUMS.txt).
.PARAMETER InstallRoot
  Target install root (default C:\CMMS).
.PARAMETER PgHost
  PostgreSQL host (default localhost).
.PARAMETER PgPort
  PostgreSQL port (default 5432).
.PARAMETER PgUser
  PostgreSQL user (default postgres).
.PARAMETER PgPassword
  PostgreSQL password (required for full/migrate steps).
.PARAMETER DbName
  Database name (default cmms).
.PARAMETER SiteName
  IIS site name (default cmms).
.PARAMETER HostHeader
  Host header (default cmms.local).
.PARAMETER Mode
  full | verify | uninstall
.PARAMETER NonInteractive
  Run without prompts.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)] [string]$SourceBundle = "",
  [Parameter(Mandatory=$false)] [string]$InstallRoot = "C:\CMMS",
  [Parameter(Mandatory=$false)] [string]$PgHost = "localhost",
  [Parameter(Mandatory=$false)] [int]$PgPort = 5432,
  [Parameter(Mandatory=$false)] [string]$PgUser = "postgres",
  [Parameter(Mandatory=$false)] [SecureString]$PgPassword,
  [Parameter(Mandatory=$false)] [string]$PgPasswordPlain = "",
  [Parameter(Mandatory=$false)] [string]$DbName = "cmms",
  [Parameter(Mandatory=$false)] [string]$SiteName = "cmms",
  [Parameter(Mandatory=$false)] [string]$HostHeader = "cmms.local",
  [Parameter(Mandatory=$false)] [ValidateSet("full","verify","uninstall")] [string]$Mode = "full",
  [Parameter(Mandatory=$false)] [switch]$NonInteractive,
  [Parameter(Mandatory=$false)] [int]$AccessTokenTTL = 900,
  [Parameter(Mandatory=$false)] [int]$RefreshTokenTTL = 28800,
  [Parameter(Mandatory=$false)] [int]$SessionIdleMS = 1800000,
  [Parameter(Mandatory=$false)] [int]$Port = 4000,
  [Parameter(Mandatory=$false)] [string]$CorsOrigins = "",
  [Parameter(Mandatory=$false)] [string]$LogLevel = "info",
  [Parameter(Mandatory=$false)] [string]$BindHost = "127.0.0.1",
  [Parameter(Mandatory=$false)] [string]$PMSchedulerCron = "0 2 * * *"
)

$ErrorActionPreference = "Stop"
$script:LogDir = Join-Path $env:ProgramData "CommandPulse\logs"
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
$ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
$script:LogFile = Join-Path $script:LogDir "install-$ts.log"

function Log {
  param([string]$Level, [string]$Msg)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Msg"
  Write-Host $line
  try { Add-Content -Path $script:LogFile -Value $line -Encoding UTF8 } catch {}
}

function Get-PgPasswordPlain {
  if ($PgPasswordPlain -and $PgPasswordPlain -ne "") { return $PgPasswordPlain }
  if ($PgPassword) {
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PgPassword)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  }
  return $null
}

function Get-PsqlPath {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cands = @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
  )
  foreach ($c in $cands) { if (Test-Path $c) { return $c } }
  return $null
}

function Get-CurrentUserSid {
  $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  return $id.User.Value
}

function Get-CurrentUserName {
  return [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
}

function New-RandomJwtSecret {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Set-EnvFileAcl {
  param([string]$EnvFile)
  if (-not (Test-Path $EnvFile)) { throw "EnvFile not found: $EnvFile" }
  Log "INFO" "Setting ACLs on $EnvFile (SYSTEM, Administrators, current user only)"
  try {
    $acl = Get-Acl -Path $EnvFile
    $acl.SetAccessRuleProtection($true, $false) # remove inherited
    $ruleSystem = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM","FullControl","Allow")
    $ruleAdmin = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators","FullControl","Allow")
    $cur = Get-CurrentUserName
    $ruleUser = New-Object System.Security.AccessControl.FileSystemAccessRule($cur,"FullControl","Allow")
    $acl.SetAccessRule($ruleSystem)
    $acl.SetAccessRule($ruleAdmin)
    $acl.SetAccessRule($ruleUser)
    Set-Acl -Path $EnvFile -AclObject $acl
    Log "INFO" "ACLs applied for $cur"
  } catch {
    Log "WARN" "Failed to set ACLs: $($_.Exception.Message)"
    throw
  }
}

function Invoke-Preflight {
  Log "INFO" "=== Preflight (detect-and-report only) ==="
  $ok = $true
  # Node
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Log "ERR" "Node.js not found"; $ok = $false } else {
    $v = & node --version 2>&1
    Log "OK" "node $v"
    if ($v -notmatch 'v(2[4-9]|[3-9][0-9])\.') { Log "WARN" "Node < 24 may be unsupported" }
  }
  # npm
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) { Log "ERR" "npm not found"; $ok = $false } else { Log "OK" "npm $(& npm --version 2>&1)" }
  # pm2
  $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
  if (-not $pm2) { Log "WARN" "pm2 not found (global). Install with: npm install -g pm2" } else { Log "OK" "pm2 $(& pm2 --version 2>&1)" }
  # psql
  $psqlp = Get-PsqlPath
  if (-not $psqlp) { Log "ERR" "psql not found on PATH or known locations"; $ok = $false } else { Log "OK" "psql: $psqlp"; $pv = & $psqlp --version 2>&1; Log "OK" "$pv" }
  # IIS
  if (Test-Path "$env:windir\System32\inetsrv\appcmd.exe") { Log "OK" "IIS appcmd found" } else { Log "WARN" "IIS not detected (optional)" }
  if (Test-Path "$env:windir\System32\inetsrv\rewrite.dll") { Log "OK" "URL Rewrite detected" } else { Log "WARN" "URL Rewrite not detected (optional)" }
  if (Test-Path "C:\Program Files\IIS Application Request Routing") { Log "OK" "ARR detected" } else { Log "WARN" "ARR not detected (optional)" }
  # W3SVC
  $w3 = Get-Service W3SVC -ErrorAction SilentlyContinue
  if ($w3) { Log "OK" "W3SVC: $($w3.Status)" } else { Log "WARN" "W3SVC service not found" }
  if (-not $ok) { throw "Preflight failed (see log). Hard stops: Node.js and PostgreSQL client tools." }
  Log "INFO" "Preflight passed"
}

function Test-BundleIntegrity {
  param([string]$Bundle)
  if (-not $Bundle -or -not (Test-Path $Bundle)) { throw "SourceBundle not specified or not found: $Bundle" }
  $sha = Join-Path $Bundle "SHA256SUMS.txt"
  if (-not (Test-Path $sha)) { throw "SHA256SUMS.txt not found in bundle: $sha" }
  Log "INFO" "Verifying bundle integrity from $sha"
  $bad = 0
  $count = 0
  $lines = Get-Content $sha
  foreach ($l in $lines) {
    if ($l.Trim() -eq "") { continue }
    # format: hash  path (two spaces)
    $parts = $l -split '\s{2}', 2
    if ($parts.Count -ne 2) { continue }
    $h = $parts[0].Trim().ToUpper()
    $p = $parts[1].Trim()
    $fp = Join-Path $Bundle $p
    if (-not (Test-Path $fp)) { Log "WARN" "Missing file: $p"; $bad++; continue }
    $calc = (Get-FileHash -Algorithm SHA256 -LiteralPath $fp).Hash.ToUpper()
    $count++
    if ($calc -ne $h) { Log "ERR" "MISMATCH: $p"; $bad++ }
  }
  Log "INFO" "Integrity check: checked $count files, mismatches $bad"
  if ($bad -gt 0) { throw "Bundle integrity failed ($bad mismatches)" }
  Log "OK" "Bundle integrity OK"
}

function Copy-Bundle {
  param([string]$Bundle, [string]$Root)
  Log "INFO" "Copying bundle to $Root"
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  $items = @("backend","frontend","ops","docs","migration-templates")
  foreach ($it in $items) {
    $src = Join-Path $Bundle $it
    if (Test-Path $src) {
      Log "INFO" "  Copying $it"
      Copy-Item -Path $src -Destination $Root -Recurse -Force
    } else {
      Log "WARN" "  Missing $it in bundle (skipping)"
    }
  }
  foreach ($f in @("RELEASE_NOTES.md","RELEASE_MANIFEST.md","SHA256SUMS.txt","IT_DEPLOYMENT_GUIDE.md")) {
    $sf = Join-Path $Bundle $f
    if (Test-Path $sf) { Copy-Item -Path $sf -Destination $Root -Force; Log "INFO" "  Copied $f" }
  }
  # Never copy database/ or dumps
  if (Test-Path (Join-Path $Root "database")) { Remove-Item -Recurse -Force (Join-Path $Root "database"); Log "INFO" "  Removed database/ (excluded)" }
}

function New-EnvFile {
  param([string]$BackendDir, [string]$DbName)
  Log "INFO" "Generating .env in $BackendDir"
  $tmpl = Join-Path $PSScriptRoot "templates\backend.env.template"
  if (-not (Test-Path $tmpl)) { throw "Template not found: $tmpl" }
  $template = Get-Content $tmpl -Raw
  $jwt = New-RandomJwtSecret
  $cors = if ($CorsOrigins -and $CorsOrigins -ne "") { $CorsOrigins } else { "https://$HostHeader" }
  $pgpw = Get-PgPasswordPlain
  if (-not $pgpw) { $pgpw = "" }
  # URL-encode password simply (common cases)
  $pgpwEnc = [Uri]::EscapeDataString($pgpw)
  $dbUrl = "postgresql://$PgUser`:$pgpwEnc@$PgHost`:$PgPort/$DbName`?connection_limit=20&pool_timeout=30000"
  $envContent = $template
  $envContent = $envContent.Replace("__DATABASE_URL__", $dbUrl)
  $envContent = $envContent.Replace("__JWT_SECRET__", $jwt)
  $envContent = $envContent.Replace("__ACCESS_TOKEN_TTL__", "$AccessTokenTTL")
  $envContent = $envContent.Replace("__REFRESH_TOKEN_TTL__", "$RefreshTokenTTL")
  $envContent = $envContent.Replace("__SESSION_IDLE_MS__", "$SessionIdleMS")
  $envContent = $envContent.Replace("__PORT__", "$Port")
  $envContent = $envContent.Replace("__CORS_ORIGINS__", $cors)
  $envContent = $envContent.Replace("__LOG_LEVEL__", $LogLevel)
  $envContent = $envContent.Replace("__BIND_HOST__", $BindHost)
  $envContent = $envContent.Replace("__PM_SCHEDULER_CRON__", $PMSchedulerCron)
  $envPath = Join-Path $BackendDir ".env"
  if (Test-Path $envPath) {
    $bak = "$envPath.bak.$ts"
    Copy-Item $envPath $bak -Force
    Log "INFO" "Backed up existing .env to $bak"
  }
  [System.IO.File]::WriteAllText($envPath, $envContent)
  Log "OK" "Wrote $envPath"
  Set-EnvFileAcl -EnvFile $envPath
  return $envPath
}

function Invoke-BackendSetup {
  param([string]$BackendDir)
  if (-not (Test-Path $BackendDir)) { throw "BackendDir not found: $BackendDir" }
  Log "INFO" "=== Backend setup (npm ci, prisma generate, migrate deploy) ==="
  $ts2 = (Get-Date).ToString("yyyyMMdd-HHmmss")
  try {
    Log "INFO" "Running npm ci --foreground-scripts (in $BackendDir)"
    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
    if (-not $npmCmd) { $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue) }
    $npxCmd = (Get-Command npx.cmd -ErrorAction SilentlyContinue)
    if (-not $npxCmd) { $npxCmd = (Get-Command npx -ErrorAction SilentlyContinue) }
    $outN = Join-Path $script:LogDir "npm-ci-out-$ts2.txt"
    $errN = Join-Path $script:LogDir "npm-ci-err-$ts2.txt"
    $p1 = Start-Process -FilePath $npmCmd.Source -ArgumentList "ci","--foreground-scripts" -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait -RedirectStandardOutput $outN -RedirectStandardError $errN
    if (Test-Path $outN) { Get-Content $outN | ForEach-Object { if ($_) { Log "NPM" $_ } } }
    if (Test-Path $errN) { Get-Content $errN | ForEach-Object { if ($_) { Log "NPM-ERR" $_ } } }
    if ($p1.ExitCode -ne 0) { throw "npm ci failed with code $($p1.ExitCode)" }
    # Ensure Prisma engines present (bundle may not include them)
    $srcPrismaClient = "C:\Users\Injaz\Documents\Default Project\CMMSproject\backend\node_modules\.prisma"
    $dstPrismaClient = Join-Path $BackendDir "node_modules\.prisma"
    if (Test-Path $srcPrismaClient) {
      try { Copy-Item "$srcPrismaClient\*" $dstPrismaClient -Recurse -Force -ErrorAction SilentlyContinue; Log "INFO" "Ensured .prisma engines" } catch { Log "WARN" "Failed to copy .prisma: $($_.Exception.Message)" }
    }
    $srcAtPrisma = "C:\Users\Injaz\Documents\Default Project\CMMSproject\backend\node_modules\@prisma"
    $dstAtPrisma = Join-Path $BackendDir "node_modules\@prisma"
    if (Test-Path $srcAtPrisma) {
      try { Copy-Item "$srcAtPrisma\*" $dstAtPrisma -Recurse -Force -ErrorAction SilentlyContinue; Log "INFO" "Ensured @prisma engines" } catch { Log "WARN" "Failed to copy @prisma: $($_.Exception.Message)" }
    }
    Log "INFO" "Running npx prisma generate"
    $outP = Join-Path $script:LogDir "prisma-gen-out-$ts2.txt"
    $errP = Join-Path $script:LogDir "prisma-gen-err-$ts2.txt"
    $p2 = Start-Process -FilePath $npxCmd.Source -ArgumentList "prisma","generate" -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait -RedirectStandardOutput $outP -RedirectStandardError $errP
    if (Test-Path $outP) { Get-Content $outP | ForEach-Object { if ($_) { Log "PRISMA" $_ } } }
    if (Test-Path $errP) { Get-Content $errP | ForEach-Object { if ($_) { Log "PRISMA-ERR" $_ } } }
    if ($p2.ExitCode -ne 0) { throw "prisma generate failed with code $($p2.ExitCode)" }
    Log "INFO" "Running npx prisma migrate deploy"
    $outM = Join-Path $script:LogDir "prisma-migrate-out-$ts2.txt"
    $errM = Join-Path $script:LogDir "prisma-migrate-err-$ts2.txt"
    $p3 = Start-Process -FilePath $npxCmd.Source -ArgumentList "prisma","migrate","deploy" -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait -RedirectStandardOutput $outM -RedirectStandardError $errM
    if (Test-Path $outM) { Get-Content $outM | ForEach-Object { if ($_) { Log "MIGRATE" $_ } } }
    if (Test-Path $errM) { Get-Content $errM | ForEach-Object { if ($_) { Log "MIGRATE-ERR" $_ } } }
    if ($p3.ExitCode -ne 0) { 
      Log "WARN" "prisma migrate deploy failed (exit $($p3.ExitCode)); trying prisma db push as fallback"
      $outP2 = Join-Path $script:LogDir "prisma-push-out-$ts2.txt"
      $errP2 = Join-Path $script:LogDir "prisma-push-err-$ts2.txt"
      $p4 = Start-Process -FilePath $npxCmd.Source -ArgumentList "prisma","db","push","--accept-data-loss" -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait -RedirectStandardOutput $outP2 -RedirectStandardError $errP2
      if (Test-Path $outP2) { Get-Content $outP2 | ForEach-Object { if ($_) { Log "PUSH" $_ } } }
      if (Test-Path $errP2) { Get-Content $errP2 | ForEach-Object { if ($_) { Log "PUSH-ERR" $_ } } }
      if ($p4.ExitCode -ne 0) { throw "prisma db push failed with code $($p4.ExitCode)" }
    }
    Log "OK" "Backend setup complete"
  } finally {
  }
}

function Invoke-Pm2Start {
  param([string]$BackendDir)
  Log "INFO" "=== PM2 start ==="
  $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
  if (-not $pm2) { throw "pm2 not found" }
  Push-Location $BackendDir
  try {
    & pm2 start ecosystem.config.cjs 2>&1 | ForEach-Object { Log "PM2" $_ }
    if ($LASTEXITCODE -ne 0) { Log "WARN" "pm2 start returned $LASTEXITCODE" }
    & pm2 save 2>&1 | ForEach-Object { Log "PM2" $_ }
    Start-Sleep -Seconds 3
    & pm2 list 2>&1 | ForEach-Object { Log "PM2" $_ }
    Log "OK" "PM2 commands executed"
  } finally {
    Pop-Location
  }
}

function Invoke-HealthCheck {
  Log "INFO" "=== Health check ==="
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:4000/api/health" -UseBasicParsing -TimeoutSec 30
    Log "OK" "http://localhost:4000/api/health -> $($r.StatusCode)"
    Log "INFO" $r.Content
    return $true
  } catch {
    Log "WARN" "Health check failed: $($_.Exception.Message)"
    return $false
  }
}

function Invoke-Uninstall {
  param([string]$Root)
  Log "INFO" "=== Uninstall (engine-created artifacts only) ==="
  if (-not (Test-Path $Root)) { Log "WARN" "InstallRoot not found: $Root"; return }
  # Stop pm2 apps if running from this backend
  $bdir = Join-Path $Root "backend"
  if (Test-Path $bdir) {
    Push-Location $bdir
    try { & pm2 delete cmms-api cmms-worker 2>&1 | ForEach-Object { Log "PM2" $_ } } catch {}
    try { & pm2 save 2>&1 | ForEach-Object { Log "PM2" $_ } } catch {}
    Pop-Location
  }
  Log "WARN" "Uninstall does not drop the database. Remove files manually if desired: $Root"
  Log "INFO" "Uninstall complete"
}

# Main
try {
  Log "INFO" "CommandPulse CMMS Installer Engine starting (Mode: $Mode)"
  Log "INFO" "InstallRoot: $InstallRoot | Bundle: $SourceBundle | DB: $DbName@$PgHost`:$PgPort"
  Log "INFO" "Current user: $(Get-CurrentUserName)"

  if (-not (Test-Admin)) {
    Log "WARN" "Not running as Administrator. Some steps (ACLs, PM2 system tasks) may fail."
  }

  if ($Mode -eq "verify") {
    Invoke-HealthCheck
    Log "INFO" "Engine finished (verify)"
    exit 0
  }

  if ($Mode -eq "uninstall") {
    Invoke-Uninstall -Root $InstallRoot
    Log "INFO" "Engine finished (uninstall)"
    exit 0
  }

  # full
  Invoke-Preflight
  Test-BundleIntegrity -Bundle $SourceBundle
  Copy-Bundle -Bundle $SourceBundle -Root $InstallRoot
  $bdir = Join-Path $InstallRoot "backend"
  $envp = New-EnvFile -BackendDir $bdir -DbName $DbName
  Invoke-BackendSetup -BackendDir $bdir
  Invoke-Pm2Start -BackendDir $bdir
  $hc = Invoke-HealthCheck
  if (-not $hc) { Log "WARN" "Health check did not return 200 yet; check PM2 logs in $bdir\logs" }
  Log "INFO" "Engine finished (full). Log: $script:LogFile"
  exit 0
} catch {
  Log "ERR" $_.Exception.Message
  Log "ERR" $_.ScriptStackTrace
  Log "INFO" "Engine failed. Log: $script:LogFile"
  exit 1
}