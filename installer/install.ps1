#requires -version 5.1
<#
.SYNOPSIS
  CommandPulse CMMS installer engine.

.DESCRIPTION
  Installs a BLANK CommandPulse CMMS instance from a compiled release bundle.
  It reproduces, unattended, the procedure documented in IT_DEPLOYMENT_GUIDE.md
  section 5: preflight, integrity verification, file copy, .env generation,
  dependency install, Prisma client generation, schema migration, PM2 start and
  a first-run health check.

  Design rules:
    * Detect-and-report for prerequisites. The engine never downloads or installs
      Node.js, PostgreSQL, PM2 or IIS. Missing hard prerequisites abort with the
      fix; missing optional ones are warnings.
    * No developer-machine paths anywhere. Every input is a parameter or comes
      from the supplied bundle, so the engine runs unchanged on a client server.
    * Secrets are never written to the log and never echoed to the console.
    * The engine writes only to the database named by -DbName. That parameter
      defaults to `cmms`, which is the live production database name on the
      existing host, so every side-by-side or test install must pass a new
      name; the harness uses cmms_installer_test_<random>. On a host that
      already runs CommandPulse the engine warns when -DbName is `cmms`.

.PARAMETER SourceBundle
  Path to the extracted release bundle. Must contain backend/, frontend/, ops/,
  docs/ and SHA256SUMS.txt.

.PARAMETER InstallRoot
  Directory the application is installed into.

.PARAMETER PgHost
  PostgreSQL host. Default localhost.

.PARAMETER PgPort
  PostgreSQL port. Default 5432.

.PARAMETER PgUser
  PostgreSQL role used by the application. Default postgres.

.PARAMETER PgPassword
  PostgreSQL password as a SecureString. Alternatively set -PgPasswordEnv to the
  name of an environment variable holding it, or leave both unset in
  interactive mode to be prompted (the input is masked).

.PARAMETER PgPasswordEnv
  Name of an environment variable holding the PostgreSQL password.

.PARAMETER DbName
  Database the application connects to. Default cmms. On a host that already
  runs CommandPulse, `cmms` is the live database: pass a new name for a test or
  side-by-side install. The engine warns when this value is `cmms`.

.PARAMETER ApiPort
  TCP port the API listens on. Default 4000. The value is written to .env AND
  applied to the generated install-local PM2 ecosystem file, because the shipped
  ecosystem.config.cjs pins PORT and PM2's ecosystem env wins over the process
  environment. In `full` mode the engine refuses a port that is already
  listening: otherwise the health check could be answered by another service.

.PARAMETER BindHost
  Address the API binds to. Default 127.0.0.1 (loopback, reverse-proxy only).

.PARAMETER SiteName
  Host name used for CORS and for the optional IIS site. Default cmms.local.

.PARAMETER AppNamePrefix
  Prefix for the names this install registers with PM2. The shipped names are
  "cmms-api" and "cmms-worker"; with a prefix they become "<prefix>api" and
  "<prefix>worker". Set this when the host already runs a CommandPulse CMMS
  under PM2, or when more than one instance is installed side by side. On
  Windows PM2 keeps a single daemon per user account, so the name is the only
  thing that keeps two installs apart.

.PARAMETER PrismaEnginesPath
  Optional folder containing prebuilt Prisma engine binaries
  (query_engine-windows.dll.node and schema-engine-windows.exe). When present
  the engine copies them into the install so the installation does not depend
  on downloading them from binaries.prisma.sh. When absent, the engine lets
  npm/prisma fetch them and reports a clear error if that fails.

.PARAMETER AdminFile
  Optional path to a JSON file holding the first Administrator account:
  {"username","fullName","email","password"}. The wizard writes it to a
  random-named, ACL-restricted temp file and deletes it afterwards. The engine
  pipes the password to the helper on stdin, so it never appears in argv, the
  environment, or the install log. When the parameter is absent the blank
  database is left with no user, and the log records that.

.PARAMETER Mode
  full   - install from the bundle (default)
  verify - health-check an existing install only
  uninstall - remove engine-created artifacts only; never drops the database

.PARAMETER NonInteractive
  Never prompt. Fails instead of asking.
#>
[CmdletBinding()]
param(
  [string]$SourceBundle = "",
  [string]$InstallRoot = "C:\CMMS",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$PgUser = "postgres",
  [SecureString]$PgPassword,
  [string]$PgPasswordEnv = "",
  [string]$DbName = "cmms",
  [int]$ApiPort = 4000,
  [string]$BindHost = "127.0.0.1",
  [string]$SiteName = "cmms.local",
  [string]$CorsOrigins = "",
  [string]$AppNamePrefix = "",
  [string]$PrismaEnginesPath = "",
  [string]$AdminFile = "",
  [ValidateSet("full","verify","uninstall")][string]$Mode = "full",
  [int]$AccessTokenTTL = 900,
  [int]$RefreshTokenTTL = 28800,
  [int]$SessionIdleMs = 1800000,
  [string]$LogLevel = "info",
  [string]$PMSchedulerCron = "0 2 * * *",
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
# Native command output is decoded with the console output encoding. On
# Windows PowerShell 5.1 that defaults to the OEM code page, which turns the
# box-drawing characters PM2 uses into mojibake. The tools write UTF-8.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$script:LogDir = Join-Path $env:ProgramData "CommandPulse\logs"
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
$script:RunStamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$script:LogFile = Join-Path $script:LogDir "install-$script:RunStamp.log"

# ---------------------------------------------------------------- logging ---

function Log {
  param([string]$Level, [string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
  $line = Redact-Secrets $line
  Write-Host $line
  try { Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8 } catch { }
}

# PM2 colours its output with ANSI escape sequences. They make the log
# unreadable and they break any attempt to parse the output, so they are
# removed before the text is used. The escape character is built from its
# code point: writing it as a literal in the source would depend on how the
# file is read.
$script:AnsiRegex = [string][char]27 + '\[[0-9;?]*[ -/]*[@-~]'

function Remove-Ansi {
  param([string]$Text)
  if (-not $Text) { return $Text }
  return [regex]::Replace($Text, $script:AnsiRegex, "")
}

# ------------------------------------------------------------- redaction ---

# The engine resolves the PostgreSQL password into memory to build DATABASE_URL.
# A native tool that echoes its own environment would put the value in the log:
# PM2's `jlist` did exactly that. Every line and every captured output file is
# passed through Redact-Secrets, and the value is registered as soon as it is
# resolved. The patterns below are a second line of defence for the shapes a
# credential takes in tool output, so a future command that prints one is
# scrubbed even if it was never registered.
$script:Secrets = New-Object System.Collections.Generic.List[string]

function Add-Secret {
  param([string]$Value)
  if ($Value -and $Value.Length -ge 4 -and -not $script:Secrets.Contains($Value)) {
    $script:Secrets.Add($Value) | Out-Null
  }
}

function Redact-Secrets {
  param([string]$Text)
  if (-not $Text) { return $Text }
  foreach ($s in $script:Secrets) {
    if ($s) { $Text = $Text.Replace($s, "***") }
  }
  $Text = [regex]::Replace($Text, '(?i)(PGPASSWORD\s*[=:]\s*)\S+', '$1***')
  $Text = [regex]::Replace($Text, '(?i)(postgres(?:ql)?://[^:/@\s]+:)[^@\s]+(@)', '$1***$2')
  $Text = [regex]::Replace($Text, '(?i)("(?:password|pgpassword)"\s*:\s*")[^"]+(")', '$1***$2')
  return $Text
}

function Redact-File {
  param([string]$File)
  if (-not $File -or $script:Secrets.Count -eq 0) { return }
  if (-not (Test-Path -LiteralPath $File)) { return }
  try {
    $raw = [System.IO.File]::ReadAllText($File)
    $clean = Redact-Secrets $raw
    if ($clean -ne $raw) { [System.IO.File]::WriteAllText($File, $clean) }
  } catch { }
}

# ------------------------------------------------------- external commands ---

# Runs a native command with a hard timeout while streaming its output into the
# install log. A hung child (a stalled npm download, for example) is killed
# rather than leaving the wizard looking frozen.
function Invoke-External {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = "",
    [int]$TimeoutSeconds = 1800,
    [string]$LogTag = "EXEC",
    [switch]$Quiet
  )
  $ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $outFile = Join-Path $script:LogDir "$LogTag-out-$ts.txt"
  $errFile = Join-Path $script:LogDir "$LogTag-err-$ts.txt"
  $startParams = @{
    FilePath               = $FilePath
    ArgumentList           = $ArgumentList
    NoNewWindow            = $true
    PassThru               = $true
    RedirectStandardOutput = $outFile
    RedirectStandardError  = $errFile
  }
  if ($WorkingDirectory) { $startParams["WorkingDirectory"] = $WorkingDirectory }
  Log "INFO" "$LogTag : $FilePath $($ArgumentList -join ' ')"
  $proc = Start-Process @startParams
  # Touching .Handle caches the process handle. Without it, PowerShell can
  # return a null ExitCode for a process that has already exited.
  $null = $proc.Handle
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $outPos = 0
  $errPos = 0
  while (-not $proc.HasExited) {
    Start-Sleep -Milliseconds 700
    foreach ($pair in @(@($outFile, [ref]$outPos, $LogTag), @($errFile, [ref]$errPos, "$LogTag-ERR"))) {
      $f = $pair[0]; $posRef = $pair[1]; $tag = $pair[2]
      if (-not (Test-Path $f)) { continue }
      try {
        $content = [System.IO.File]::ReadAllText($f)
        if ($content.Length -gt $posRef.Value) {
          $new = $content.Substring($posRef.Value)
          $posRef.Value = $content.Length
          foreach ($l in ($new -split "`r?`n")) {
            if ($l -and $l.Trim() -ne "") { Log $tag $l }
          }
        }
      } catch { }
    }
    if ((Get-Date) -gt $deadline) {
      Log "ERR" "$LogTag timed out after $TimeoutSeconds seconds; terminating"
      try { & taskkill /PID $proc.Id /T /F 2>&1 | Out-Null } catch { }
      try { $proc.WaitForExit(10000) | Out-Null } catch { }
      throw "$LogTag timed out after $TimeoutSeconds seconds."
    }
  }
  $proc.WaitForExit()
  $proc.Refresh()
  foreach ($pair in @(@($outFile, [ref]$outPos, $LogTag), @($errFile, [ref]$errPos, "$LogTag-ERR"))) {
    $f = $pair[0]; $posRef = $pair[1]; $tag = $pair[2]
    if (-not (Test-Path $f)) { continue }
    try {
      $content = [System.IO.File]::ReadAllText($f)
      if ($content.Length -gt $posRef.Value) {
        $new = $content.Substring($posRef.Value)
        $posRef.Value = $content.Length
        foreach ($l in ($new -split "`r?`n")) {
          if ($l -and $l.Trim() -ne "") { Log $tag $l }
        }
      }
    } catch { }
  }
  $code = $proc.ExitCode
  Log "INFO" "$LogTag exit code $code"
  # The streamed lines were redacted on the way into the log; the captured
  # files are scrubbed here so a tool that dumped its environment leaves no
  # copy behind.
  Redact-File $outFile
  Redact-File $errFile
  if ($Quiet) {
    $lines = @()
    if (Test-Path $outFile) { $lines += [System.IO.File]::ReadAllLines($outFile) }
    if (Test-Path $errFile) { $lines += [System.IO.File]::ReadAllLines($errFile) }
    return [pscustomobject]@{ ExitCode = $code; Lines = $lines }
  }
  return $code
}

function Get-CmdPath {
  param([string[]]$Names)
  foreach ($n in $Names) {
    $c = Get-Command $n -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
  }
  return $null
}

# ------------------------------------------------------------- credentials ---

function Resolve-PgPassword {
  if ($PgPassword) {
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PgPassword)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  }
  if ($PgPasswordEnv) {
    $v = [Environment]::GetEnvironmentVariable($PgPasswordEnv)
    if ($v) { return $v }
    throw "Environment variable $PgPasswordEnv is not set."
  }
  if ($NonInteractive) { throw "No PostgreSQL password supplied (-PgPassword or -PgPasswordEnv) and -NonInteractive was specified." }
  $secure = Read-Host -AsSecureString "PostgreSQL password for role '$PgUser'"
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

# ------------------------------------------------------------- preflight ----

# A blank install must own its API port. Without this check the health test can
# be satisfied by an unrelated service already listening there - on the live
# host, `cmms-api` itself - and a failed install would look successful.
function Test-PortInUse {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(2000)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch { }
  }
}

function Get-PsqlPath {
  $c = Get-Command psql -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Test-Prerequisites {
  Log "INFO" "=== Preflight (detect and report; nothing is installed) ==="
  $hard = $false
  $node = Get-CmdPath @("node.exe", "node")
  if (-not $node) { Log "ERR" "Node.js not found. Install Node.js 24 LTS from https://nodejs.org/ and re-run."; $hard = $true }
  else {
    $v = (& $node --version 2>&1 | Select-Object -First 1)
    Log "OK" "Node.js $v"
    if ("$v" -notmatch '^v(2[4-9]|[3-9][0-9])\.') { Log "WARN" "Node.js 24 LTS or newer is recommended; found $v" }
  }
  $npm = Get-CmdPath @("npm.cmd", "npm")
  if (-not $npm) { Log "ERR" "npm not found. It ships with Node.js."; $hard = $true } else { Log "OK" "npm $(& $npm --version 2>&1 | Select-Object -First 1)" }
  $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
  if (-not $pm2) { Log "WARN" "PM2 not found. Install it with: npm install -g pm2" } else { Log "OK" "PM2 at $pm2" }
  $psql = Get-PsqlPath
  if (-not $psql) { Log "ERR" "psql not found. Install PostgreSQL 15+ and add its bin folder to PATH."; $hard = $true }
  else { Log "OK" "psql $psql ($(& $psql --version 2>&1 | Select-Object -First 1))" }
  if (Test-Path "$env:windir\System32\inetsrv\appcmd.exe") { Log "OK" "IIS detected" } else { Log "WARN" "IIS not detected. The API still installs; serving the frontend via IIS is a separate step." }
  if (Test-Path "$env:windir\System32\inetsrv\rewrite.dll") { Log "OK" "IIS URL Rewrite detected" } else { Log "WARN" "IIS URL Rewrite not detected. Required only if the frontend is served through IIS." }
  $arr = Get-ChildItem "C:\Program Files" -Filter "*Application Request Routing*" -Directory -ErrorAction SilentlyContinue
  if ($arr) { Log "OK" "IIS Application Request Routing detected" } else { Log "WARN" "IIS Application Request Routing not detected. Required only for an IIS reverse proxy." }
  if ($hard) { throw "Preflight failed. Fix the errors above and re-run the installer." }
  Log "OK" "Preflight passed"
}

# ------------------------------------------------------------- integrity ----

function Test-BundleIntegrity {
  param([string]$Bundle)
  if (-not $Bundle) { throw "No -SourceBundle was supplied." }
  if (-not (Test-Path -LiteralPath $Bundle)) { throw "Source bundle not found: $Bundle" }
  $sha = Join-Path $Bundle "SHA256SUMS.txt"
  if (-not (Test-Path -LiteralPath $sha)) { throw "SHA256SUMS.txt not found in the bundle: $Bundle" }
  Log "INFO" "Verifying bundle integrity"
  $checked = 0
  $bad = 0
  foreach ($line in (Get-Content -LiteralPath $sha)) {
    if (-not $line.Trim()) { continue }
    $parts = $line -split '\s{2}', 2
    if ($parts.Count -ne 2) { continue }
    $expected = $parts[0].Trim().ToUpperInvariant()
    $rel = $parts[1].Trim()
    $full = Join-Path $Bundle $rel
    if (-not (Test-Path -LiteralPath $full)) { Log "ERR" "Missing from bundle: $rel"; $bad++; continue }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToUpperInvariant()
    $checked++
    if ($actual -ne $expected) { Log "ERR" "Checksum mismatch: $rel"; $bad++ }
  }
  Log "INFO" "Integrity check: $checked files verified, $bad problem(s)"
  if ($bad -gt 0) { throw "Bundle integrity check failed ($bad problem(s)). Re-copy the bundle and try again." }
  Log "OK" "Bundle integrity verified"
}

# ------------------------------------------------------------------ copy ----

function Copy-Bundle {
  param([string]$Bundle, [string]$Root)
  Log "INFO" "Copying application files to $Root"
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  foreach ($item in @("backend", "frontend", "ops", "docs", "migration-templates")) {
    $src = Join-Path $Bundle $item
    if (Test-Path -LiteralPath $src) {
      Copy-Item -LiteralPath $src -Destination $Root -Recurse -Force
      Log "INFO" "  copied $item"
    } else {
      Log "WARN" "  bundle has no $item folder; skipped"
    }
  }
  foreach ($f in @("RELEASE_NOTES.md", "RELEASE_MANIFEST.md", "SHA256SUMS.txt", "IT_DEPLOYMENT_GUIDE.md")) {
    $src = Join-Path $Bundle $f
    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $Root -Force; Log "INFO" "  copied $f" }
  }
  # A blank instance must never receive a database dump or any client data.
  # The `database\` folder is where a published bundle keeps a full dump; it is
  # removed wholesale. Stray .sql files elsewhere are removed too, EXCEPT the
  # Prisma migrations under backend\prisma\migrations\, which are the schema
  # history the install needs in order to apply the database.
  $dumpDir = Join-Path $Root "database"
  if (Test-Path -LiteralPath $dumpDir) { Remove-Item -LiteralPath $dumpDir -Recurse -Force; Log "INFO" "  removed database\ (excluded: a blank instance carries no data)" }
  Get-ChildItem -LiteralPath $Root -Recurse -File -Filter "*.sql" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.FullName -match '[\\/]prisma[\\/]migrations[\\/]') { return }
    Log "INFO" "  excluded dump file $($_.FullName)"
    Remove-Item -LiteralPath $_.FullName -Force
  }
  # The published bundle ships backend\.env.deploy as a template. The install
  # generates its own .env, so the template is not copied into the install root.
  $deployTemplate = Join-Path $Root "backend\.env.deploy"
  if (Test-Path -LiteralPath $deployTemplate) { Remove-Item -LiteralPath $deployTemplate -Force; Log "INFO" "  removed backend\.env.deploy (replaced by the generated .env)" }
}

# Build the folder the web server points at: the compiled frontend files and
# web.config side by side, which is the arrangement the reverse proxy needs.
function New-SiteFolder {
  param([string]$Root)
  $srcDist = Join-Path $Root "frontend\dist"
  $srcWebConfig = Join-Path $Root "frontend\web.config"
  $site = Join-Path $Root "site"
  if (-not (Test-Path -LiteralPath $srcDist)) { Log "WARN" "frontend\dist not found; no site folder created"; return $null }
  New-Item -ItemType Directory -Force -Path $site | Out-Null
  Copy-Item -Path (Join-Path $srcDist "*") -Destination $site -Recurse -Force
  if (Test-Path -LiteralPath $srcWebConfig) { Copy-Item -LiteralPath $srcWebConfig -Destination $site -Force }
  Log "OK" "Site folder prepared at $site"
  return $site
}

# ------------------------------------------------------------------ .env ----

function New-BackendEnv {
  param([string]$BackendDir, [string]$PlainPassword)
  $template = Join-Path $PSScriptRoot "templates\backend.env.template"
  if (-not (Test-Path -LiteralPath $template)) { throw "Env template not found: $template" }
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $jwt = [Convert]::ToBase64String($bytes)
  $encodedPassword = [Uri]::EscapeDataString($PlainPassword)
  $dbUrl = "postgresql://$PgUser`:$encodedPassword@$PgHost`:$PgPort/$DbName`?connection_limit=20&pool_timeout=30000"
  $cors = if ($CorsOrigins -and $CorsOrigins.Trim()) { $CorsOrigins.Trim() } else { "https://$SiteName" }
  $content = [System.IO.File]::ReadAllText($template)
  $content = $content.Replace("__DATABASE_URL__", $dbUrl)
  $content = $content.Replace("__JWT_SECRET__", $jwt)
  $content = $content.Replace("__ACCESS_TOKEN_TTL__", "$AccessTokenTTL")
  $content = $content.Replace("__REFRESH_TOKEN_TTL__", "$RefreshTokenTTL")
  $content = $content.Replace("__SESSION_IDLE_MS__", "$SessionIdleMs")
  $content = $content.Replace("__PORT__", "$ApiPort")
  $content = $content.Replace("__CORS_ORIGINS__", $cors)
  $content = $content.Replace("__LOG_LEVEL__", $LogLevel)
  $content = $content.Replace("__BIND_HOST__", $BindHost)
  $content = $content.Replace("__PM_SCHEDULER_CRON__", $PMSchedulerCron)
  $envPath = Join-Path $BackendDir ".env"
  if (Test-Path -LiteralPath $envPath) {
    $backup = "$envPath.bak.$script:RunStamp"
    Copy-Item -LiteralPath $envPath -Destination $backup -Force
    Log "INFO" "Existing .env backed up to $backup"
  }
  [System.IO.File]::WriteAllText($envPath, $content)
  Log "OK" "Generated $envPath with a fresh random JWT secret"
  Protect-EnvFile -EnvFile $envPath
  return $envPath
}

# The installer's security control: the .env holds the only JWT signing key and
# the database password, so it is readable by exactly three principals:
# SYSTEM, BUILTIN\Administrators and the account running the installer. The
# account is resolved at run time - it is never hardcoded - so the same
# installer works on any client server under whatever local account the IT
# administrator uses.
function Protect-EnvFile {
  param([string]$EnvFile)
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $currentSid = $identity.User
  $currentName = $identity.Name
  Log "INFO" "Restricting $EnvFile to SYSTEM, BUILTIN\Administrators and $currentName"
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
  $allow = [System.Security.AccessControl.AccessControlType]::Allow
  foreach ($sid in @(
      (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")),
      (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")),
      $currentSid)) {
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, $rights, $allow)))
  }
  try { $acl.SetOwner($currentSid) } catch { Log "WARN" "Could not set the file owner: $($_.Exception.Message)" }
  Set-Acl -LiteralPath $EnvFile -AclObject $acl
  $verify = Get-Acl -LiteralPath $EnvFile
  $trustees = @($verify.Access | ForEach-Object { $_.IdentityReference.Value })
  $expected = @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators", $currentName)
  $missing = @($expected | Where-Object { $trustees -notcontains $_ })
  $extra = @($trustees | Where-Object { $expected -notcontains $_ })
  if ($missing.Count -gt 0) { throw "Could not grant the required access to: $($missing -join ', ')" }
  if ($extra.Count -gt 0) { throw "Unexpected access remains on the .env: $($extra -join ', ')" }
  Log "OK" "Access restricted to: $($trustees -join ', ')"
}

# ---------------------------------------------------------- PM2 ecosystem ---

# The names this install registers with PM2.
#
# On Windows PM2 keeps a SINGLE daemon per user account. PM2_HOME relocates the
# logs and dump.pm2 but it does NOT give a second daemon, so two installs on one
# host share one process table. The application name is therefore the only
# thing that keeps them apart: an install that reuses the shipped names
# replaces whatever already holds them.
function Get-AppNames {
  param([string]$Prefix)
  if ($Prefix) { return @("$Prefix" + "api", "$Prefix" + "worker") }
  return @("cmms-api", "cmms-worker")
}

# The shipped ecosystem.config.cjs pins PORT and BIND_HOST, and PM2 applies the
# ecosystem env over the process environment. An install that needs a different
# port therefore needs an install-local ecosystem file. The shipped file is left
# untouched; this generated one imports it and overrides the API entry.
#
# The generated file MUST keep the ".config.cjs" naming. PM2 only treats a file
# whose name follows that pattern as an ecosystem definition; a plain ".cjs"
# file is started as an application script, which would start an app named after
# the file, exit immediately, and look like a silent install failure.
function New-InstallEcosystem {
  param([string]$BackendDir)
  $target = Join-Path $BackendDir "ecosystem.install.config.cjs"
  $prefix = $AppNamePrefix
  $js = @"
module.exports = {
  apps: require('./ecosystem.config.cjs').apps.map(function (app) {
    var renamed = app.name;
    if ('$prefix') {
      var bare = app.name.indexOf('cmms-') === 0 ? app.name.substring(5) : app.name;
      renamed = '$prefix' + bare;
    }
    var env = Object.assign({}, app.env);
    if (app.name === 'cmms-api') { env.PORT = $ApiPort; env.BIND_HOST = '$BindHost'; }
    return Object.assign({}, app, { name: renamed, env: env });
  }),
};
"@
  [System.IO.File]::WriteAllText($target, ($js -replace "`r?`n", "`n"))
  Log "INFO" "Generated $target (PORT=$ApiPort, BIND_HOST=$BindHost, names: $((Get-AppNames -Prefix $prefix) -join ', '))"
  return $target
}

# -------------------------------------------------------- backend setup -----

function Install-PrismaEngines {
  param([string]$BackendDir)
  $clientDir = Join-Path $BackendDir "node_modules\.prisma\client"
  $engineFile = Join-Path $clientDir "query_engine-windows.dll.node"
  if (Test-Path -LiteralPath $engineFile) { Log "OK" "Prisma query engine already present"; return $true }
  if (-not $PrismaEnginesPath) { return $false }
  if (-not (Test-Path -LiteralPath $PrismaEnginesPath)) { Log "WARN" "PrismaEnginesPath does not exist: $PrismaEnginesPath"; return $false }
  Log "INFO" "Copying Prisma engines from $PrismaEnginesPath"
  New-Item -ItemType Directory -Force -Path $clientDir | Out-Null
  foreach ($name in @("query_engine-windows.dll.node", "schema-engine-windows.exe", "libquery_engine-windows.dll.node", "query_engine_bg.js", "query_engine_bg.wasm")) {
    $src = Join-Path $PrismaEnginesPath $name
    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $clientDir -Force; Log "INFO" "  copied $name" }
  }
  $atPrisma = Join-Path $BackendDir "node_modules\@prisma\engines"
  New-Item -ItemType Directory -Force -Path $atPrisma | Out-Null
  foreach ($name in @("query_engine-windows.dll.node", "schema-engine-windows.exe")) {
    $src = Join-Path $PrismaEnginesPath $name
    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $atPrisma -Force }
  }
  if (Test-Path -LiteralPath $engineFile) { Log "OK" "Prisma engines installed"; return $true }
  Log "WARN" "Prisma engines could not be installed from $PrismaEnginesPath"
  return $false
}

function Install-Backend {
  param([string]$BackendDir)
  Log "INFO" "=== Backend setup ==="
  $npm = Get-CmdPath @("npm.cmd", "npm")
  $npx = Get-CmdPath @("npx.cmd", "npx")
  if (-not $npm) { throw "npm not found" }
  $code = Invoke-External -FilePath $npm -ArgumentList @("ci", "--foreground-scripts") -WorkingDirectory $BackendDir -TimeoutSeconds 1800 -LogTag "NPMCI"
  if ($code -ne 0) { throw "npm ci failed with exit code $code" }
  Log "OK" "Dependencies installed"
  $enginesOk = Install-PrismaEngines -BackendDir $BackendDir
  if (-not $npx) { throw "npx not found" }
  $code = Invoke-External -FilePath $npx -ArgumentList @("prisma", "generate") -WorkingDirectory $BackendDir -TimeoutSeconds 900 -LogTag "PRISMA"
  if ($code -ne 0) {
    if ($enginesOk) { throw "prisma generate failed with exit code $code" }
    throw "prisma generate failed with exit code $code. The Prisma engine binaries could not be downloaded from binaries.prisma.sh. Re-run with -PrismaEnginesPath pointing at a folder holding the prebuilt engines, on a host with access to binaries.prisma.sh, or copy node_modules\.prisma from a prepared install."
  }
  Log "OK" "Prisma client generated"
  $code = Invoke-External -FilePath $npx -ArgumentList @("prisma", "migrate", "deploy") -WorkingDirectory $BackendDir -TimeoutSeconds 900 -LogTag "MIGRATE"
  if ($code -ne 0) { throw "prisma migrate deploy failed with exit code $code" }
  Log "OK" "Database schema applied"
}

# ---------------------------------------------------------- administrator ---

# Creates the first Administrator so a blank install can be signed into. The
# application only lets an existing Administrator create users, so without this
# step a fresh database has no route to a first login. The helper runs from the
# installed backend directory and uses the application's own Prisma client and
# bcrypt version, so the stored hash is exactly what the API expects.
function New-Administrator {
  param([string]$BackendDir)
  Log "INFO" "=== First Administrator ==="
  if (-not $AdminFile) {
    Log "WARN" "No -AdminFile supplied; this database has no user until one is provisioned by other means."
    return
  }
  if (-not (Test-Path -LiteralPath $AdminFile)) { throw "Administrator file not found: $AdminFile" }

  $raw = [System.IO.File]::ReadAllText($AdminFile)
  try { $admin = $raw | ConvertFrom-Json } catch { throw "Administrator file is not valid JSON: $AdminFile" }

  $username = [string]$admin.username
  $password = [string]$admin.password
  $payload = @{
    username = $username
    fullName = [string]$admin.fullName
    email    = [string]$admin.email
    password = $password
  } | ConvertTo-Json -Compress
  if ($password) { Add-Secret $password }
  # The password is in memory from here on; the file has no further use.
  Remove-Item -LiteralPath $AdminFile -Force -ErrorAction SilentlyContinue

  $helper = Join-Path $PSScriptRoot "admin\create-admin.cjs"
  if (-not (Test-Path -LiteralPath $helper)) { throw "Administrator helper not found in the bundle: $helper" }
  $node = Get-CmdPath @("node.exe", "node")
  if (-not $node) { throw "node not found" }

  # The helper is copied in because the installed bundle does not carry the
  # installer's admin\ folder, and it is removed again whatever happens so the
  # install tree is left without installer-only files.
  $staged = Join-Path $BackendDir ".installer-create-admin.cjs"
  Copy-Item -LiteralPath $helper -Destination $staged -Force
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node
    $psi.Arguments = '"' + $staged + '"'
    $psi.WorkingDirectory = $BackendDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $null = $proc.Start()
    $proc.StandardInput.Write($payload)
    $proc.StandardInput.Close()
    # The helper reads all of stdin before it writes anything and its output is
    # a few short lines, so waiting for exit before reading cannot fill a pipe.
    if (-not $proc.WaitForExit(120000)) {
      try { $proc.Kill() } catch { }
      throw "Administrator creation timed out after 120 seconds."
    }
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $code = $proc.ExitCode
  } finally {
    Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue
  }

  $output = @((($stdout + "`n" + $stderr) -split "`r?`n") | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
  foreach ($line in $output) { Log "INFO" "  $(Redact-Secrets $line)" }

  switch ($code) {
    0 { Log "OK" "First Administrator '$username' created" }
    10 { Log "WARN" "An active Administrator already exists in this database; the supplied account was not created." }
    11 { throw "The username '$username' is already in use in this database." }
    12 { throw "The Administrator details were rejected: $($output | Select-Object -First 1)" }
    default { throw "Administrator creation failed with exit code $code. See the helper output above." }
  }
}

# ------------------------------------------------------------- PM2 / app ----

function Start-Application {
  param([string]$BackendDir)
  $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
  if (-not $pm2) { throw "PM2 not found. Install it with: npm install -g pm2" }
  $ecosystem = New-InstallEcosystem -BackendDir $BackendDir
  $names = Get-AppNames -Prefix $AppNamePrefix
  Log "INFO" "=== Starting the application with PM2 ==="

  # An install owns its own application names. If a previous install (or an
  # unrelated process) already holds one of them in this PM2 daemon, it is
  # replaced rather than left running alongside and fighting over the port.
  foreach ($name in $names) {
    $clash = Get-Pm2AppState -Pm2Path $pm2 -WorkingDir $backendDir -Name $name
    if ($clash) {
      Log "WARN" "PM2 already has an application named '$name' (status $($clash.Status)); replacing it"
      Invoke-External -FilePath $pm2 -ArgumentList @("delete", $name) -WorkingDirectory $backendDir -TimeoutSeconds 120 -LogTag "PM2DEL" | Out-Null
    }
  }

  $code = Invoke-External -FilePath $pm2 -ArgumentList @("start", $ecosystem) -WorkingDirectory $BackendDir -TimeoutSeconds 300 -LogTag "PM2START"
  if ($code -ne 0) { Log "WARN" "pm2 start returned $code" }
  $code = Invoke-External -FilePath $pm2 -ArgumentList @("save") -WorkingDirectory $BackendDir -TimeoutSeconds 120 -LogTag "PM2SAVE"
  if ($code -ne 0) { Log "WARN" "pm2 save returned $code" }
  Start-Sleep -Seconds 4
  Invoke-External -FilePath $pm2 -ArgumentList @("list") -WorkingDirectory $BackendDir -TimeoutSeconds 60 -LogTag "PM2LIST" | Out-Null
}

# `pm2 jlist` cannot be used to read the process table here. PM2 returns the
# full environment block of every application, and on Windows that block holds
# keys that differ only in case (`username` and `USERNAME`). Windows
# PowerShell 5.1 resolves dictionary keys case-insensitively and throws
# "duplicated keys" on ConvertFrom-Json, so the JSON is unusable. The text
# output of `pm2 describe` is parsed instead.
# PM2 draws its `describe` table with box-drawing characters (U+2502) and
# colours it with ANSI sequences. The status is read from the "status" row
# after the colour codes are removed, and it is only accepted when it is a
# status PM2 actually reports.
function Get-Pm2StatusFromText {
  param([string]$Text)
  $clean = Remove-Ansi $Text
  $line = ($clean -split "`r?`n" | Where-Object { $_ -match '\bstatus\b' } | Select-Object -First 1)
  if (-not $line) { return "unknown" }
  if ($line -match 'status[^A-Za-z0-9]*([A-Za-z]+)') {
    $word = $Matches[1]
    if ($word -match '^(online|stopped|errored|launching|launched|created|deleting|zombie|unknown|waiting)$') { return $word }
  }
  return "unknown"
}

function Get-Pm2AppState {
  param([string]$Pm2Path, [string]$WorkingDir, [string]$Name)
  $desc = Invoke-External -FilePath $Pm2Path -ArgumentList @("describe", $Name) -WorkingDirectory $WorkingDir -TimeoutSeconds 60 -LogTag "PM2DESC" -Quiet
  $text = Remove-Ansi (($desc.Lines -join "`n"))
  if ($desc.ExitCode -ne 0 -or $text -match "doesn't exist") { return $null }
  $status = Get-Pm2StatusFromText -Text $text
  $procId = 0
  $pidOut = Invoke-External -FilePath $Pm2Path -ArgumentList @("pid", $Name) -WorkingDirectory $WorkingDir -TimeoutSeconds 30 -LogTag "PM2PID" -Quiet
  $pidText = (($pidOut.Lines -join "`n")).Trim()
  if ($pidText -match '^\d+$') { $procId = [int]$pidText }
  return [pscustomobject]@{ Name = $Name; Status = $status; Pid = $procId }
}

function Test-Pm2Apps {
  param([string]$Pm2Path, [string]$WorkingDir)
  $expected = Get-AppNames -Prefix $AppNamePrefix
  $allOnline = $true
  foreach ($name in $expected) {
    $app = Get-Pm2AppState -Pm2Path $Pm2Path -WorkingDir $WorkingDir -Name $name
    if (-not $app) { Log "ERR" "PM2 has no application named '$name'"; $allOnline = $false; continue }
    if ($app.Status -ne "online") {
      Log "ERR" "PM2 application '$name' is '$($app.Status)', not 'online'"
      $allOnline = $false
    } else {
      Log "OK" "PM2 application '$name' is online (pid $($app.Pid))"
    }
  }
  return $allOnline
}

function Test-Health {
  param([int]$Port)
  Log "INFO" "=== Health check ==="
  $url = "http://127.0.0.1:$Port/api/health"
  for ($i = 1; $i -le 12; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
      if ($resp.StatusCode -eq 200) {
        Log "OK" "$url returned 200"
        Log "INFO" "  body: $($resp.Content)"
        return $true
      }
    } catch {
      Log "INFO" "  attempt $i of 12: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 5
  }
  Log "ERR" "The API did not answer on $url. Check the logs in $InstallRoot\backend\logs."
  return $false
}

# ------------------------------------------------------------ uninstall -----

function Invoke-Uninstall {
  param([string]$Root)
  Log "INFO" "=== Uninstall (engine-created artifacts only) ==="
  $backendDir = Join-Path $Root "backend"
  if (Test-Path -LiteralPath $backendDir) {
    $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
    if ($pm2) {
      # Only this install's own application names are deleted. `pm2 kill` is
      # deliberately NOT used: on Windows it would stop every application in
      # the daemon, including ones this install does not own.
      $names = Get-AppNames -Prefix $AppNamePrefix
      Invoke-External -FilePath $pm2 -ArgumentList (@("delete") + $names) -WorkingDirectory $backendDir -TimeoutSeconds 120 -LogTag "PM2DEL" | Out-Null
      Invoke-External -FilePath $pm2 -ArgumentList @("save") -WorkingDirectory $backendDir -TimeoutSeconds 60 -LogTag "PM2SAVE" | Out-Null
    }
  }
  if (Test-Path -LiteralPath $Root) {
    Log "WARN" "Removing $Root"
    Remove-Item -LiteralPath $Root -Recurse -Force
  }
  Log "WARN" "The database '$DbName' was NOT dropped. Remove it yourself if it is no longer needed."
  Log "OK" "Uninstall complete"
}

# ------------------------------------------------------------------ main ----

try {
  Log "INFO" "CommandPulse CMMS installer engine starting (mode: $Mode)"
  Log "INFO" "Install root : $InstallRoot"
  Log "INFO" "Bundle       : $SourceBundle"
  Log "INFO" "Database     : $DbName on $PgHost`:$PgPort as $PgUser"
  if ($DbName -eq "cmms") {
    Log "WARN" "-DbName is 'cmms'. On a host that already runs CommandPulse this is the LIVE database; pass a new name for a test or side-by-side install."
  }
  Log "INFO" "API endpoint : http://$BindHost`:$ApiPort"
  Log "INFO" "Identity     : $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"

  if ($Mode -eq "verify") {
    if (Test-Health -Port $ApiPort) { Log "INFO" "Engine finished (verify)"; exit 0 }
    Log "ERR" "Health check failed"; exit 2
  }

  if ($Mode -eq "uninstall") {
    Invoke-Uninstall -Root $InstallRoot
    Log "INFO" "Engine finished (uninstall)"; exit 0
  }

  Test-Prerequisites
  if (Test-PortInUse -Port $ApiPort) {
    throw "TCP port $ApiPort is already in use on 127.0.0.1. This engine installs a blank instance; pass a free -ApiPort so the health check cannot be answered by a different service."
  }
  Log "OK" "API port $ApiPort is free"
  Test-BundleIntegrity -Bundle $SourceBundle
  Copy-Bundle -Bundle $SourceBundle -Root $InstallRoot

  $backendDir = Join-Path $InstallRoot "backend"
  if (-not (Test-Path -LiteralPath $backendDir)) { throw "The bundle has no backend\ folder; $InstallRoot is not a valid install root." }
  New-SiteFolder -Root $InstallRoot | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir "logs") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir "uploads") | Out-Null

  $plainPassword = Resolve-PgPassword
  Add-Secret $plainPassword
  New-BackendEnv -BackendDir $backendDir -PlainPassword $plainPassword | Out-Null
  $plainPassword = $null

  Install-Backend -BackendDir $backendDir
  New-Administrator -BackendDir $backendDir
  Start-Application -BackendDir $backendDir

  # `pm2 start` exits 0 even when an application crashes on its first tick, so
  # the process table is checked before the health check. A stopped application
  # is reported as a failed install rather than being left to time out.
  $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
  $appsOnline = Test-Pm2Apps -Pm2Path $pm2 -WorkingDir $backendDir

  $healthy = Test-Health -Port $ApiPort

  Log "INFO" "Install log: $script:LogFile"
  if (-not $appsOnline) { Log "ERR" "The PM2 applications are not all online. See the log for the PM2 output."; exit 3 }
  if ($healthy) { Log "INFO" "Engine finished (full)"; exit 0 }
  Log "ERR" "The installation completed but the API is not answering yet."; exit 3
}
catch {
  Log "ERR" $_.Exception.Message
  if ($_.ScriptStackTrace) { Log "ERR" $_.ScriptStackTrace }
  Log "INFO" "Install log: $script:LogFile"
  exit 1
}