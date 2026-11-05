#requires -version 5.1
<#
.SYNOPSIS
  CommandPulse CMMS installer engine.

.DESCRIPTION
  Installs a BLANK CommandPulse CMMS instance from a compiled release bundle.
  It reproduces, unattended, the procedure documented in IT_DEPLOYMENT_GUIDE.md
  section 5: preflight, integrity verification, file copy, .env generation,
  dependency install, Prisma client generation, schema migration, Windows service
  registration and a first-run health check.

  Design rules:
    * Detect-and-report for prerequisites. The engine never downloads or installs
      Node.js, PostgreSQL, IIS or the .NET Framework. Missing hard prerequisites
      abort with the fix; missing optional ones are warnings.
    * No developer-machine paths anywhere. Every input is a parameter or comes
      from the supplied bundle, so the engine runs unchanged on a client server.
    * Secrets are never written to the log and never echoed to the console.
    * The engine writes only to the database named by -DbName. That parameter
      defaults to `cmms`, which is the live production database name on the
      existing host, so every side-by-side or test install must pass a new
      name; the harness uses cmms_installer_test_<random>.
    * The target is classified by STATE, not by name. A database that does not
      exist is created; an empty one is migrated; a CommandPulse database is
      migrated only with -AllowExistingDatabase; a database with tables but no
      CommandPulse migration history is never touched. The decision is a fact
      read from the server, so an upgrade and an accidental overwrite are
      distinguishable.

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
  side-by-side install. The engine classifies the target (absent, empty,
  CommandPulse, foreign) before it copies any file and acts on that state.

.PARAMETER AllowExistingDatabase
  Permit the install to apply migrations to an existing CommandPulse database.
  Without it the engine refuses such a target and exits 4, so a fresh install
  cannot silently upgrade (or damage) a database that is already in use. It has
  no effect on an absent, empty or foreign database: absent is created, empty is
  migrated, foreign is always refused.

.PARAMETER ProbeOut
  With -Mode probe, write the database classification as one JSON object to this
  path. The wizard uses it to ask the operator whether to upgrade. Probe performs
  no copy, no migration and no write to the target.

.PARAMETER ApiPort
  TCP port the API listens on. Default 4000. The value is written to .env AND
  into the Windows service definition as the PORT environment variable. In
  `full` mode the engine refuses a port that is already listening unless the
  holder is this install's own application: otherwise the health check could be
  answered by another service.

.PARAMETER BindHost
  Address the API binds to. Default 127.0.0.1 (loopback, reverse-proxy only).

.PARAMETER SiteName
  Host name used for CORS and for the optional IIS site. Default cmms.local.

.PARAMETER SitePath
  Folder the web server serves for -SiteName. When unset the engine asks IIS for
  the physical path of the site named by -SiteName, so the compiled frontend is
  deployed to the live site on an upgrade instead of being left behind in the
  install root. Pass it explicitly on a host where the site name is not the one
  the browser uses. When neither resolves, the frontend is left in the install
  root and the log says so.

.PARAMETER AppNamePrefix
  Prefix for the Windows service names this install registers. The shipped names
  are CommandPulseCMMSAPI and CommandPulseCMMSWorker; with a prefix "cmmstest1"
  they become CommandPulseCMMScmmstest1API and CommandPulseCMMScmmstest1Worker.
  Set this when the host already runs a CommandPulse CMMS, or when more than one
  instance is installed side by side. The same prefix is used to find and remove
  a legacy PM2 application pair from an older installation.

.PARAMETER ServiceAccount
  Account the two services run as. Default LocalSystem, which needs no password
  and starts at boot with nobody logged on. LocalService, NetworkService or a
  DOMAIN\user account can be supplied instead; a non-built-in account needs
  -ServiceAccountPassword.

.PARAMETER ServiceAccountPassword
  Password for -ServiceAccount when it is not LocalSystem, LocalService or
  NetworkService. Held as a SecureString and never written to the log.

.PARAMETER DependOnPostgres
  Add an SCM dependency from the CMMS services to the local PostgreSQL service.
  Off by default: the API does not need the database to boot, and a PostgreSQL
  that spends minutes in crash recovery would otherwise block the API from
  starting at all. Enable it only where the PostgreSQL service starts reliably.

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
  probe  - report the database state as JSON; writes nothing

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
  [string]$SitePath = "",
  [string]$CorsOrigins = "",
  [string]$AppNamePrefix = "",
  [string]$ServiceAccount = "LocalSystem",
  [SecureString]$ServiceAccountPassword,
  [switch]$DependOnPostgres,
  [string]$PrismaEnginesPath = "",
  [string]$AdminFile = "",
  [ValidateSet("full","verify","uninstall","probe")][string]$Mode = "full",
  [string]$ProbeOut = "",
  [switch]$AllowExistingDatabase,
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

# Start-Process redirects a child's standard streams to the capture files, and a
# child that hands those handles to something longer-lived keeps the file open
# after the launcher has exited. A Windows service wrapper does exactly that:
# the launcher reports its exit code while the service it registered still holds
# the inherited handle. File.ReadAllText opens with FileShare.Read, so that
# lingering handle turned a successful `-Mode install` into "The process cannot
# access the file ... because it is being used by another process" at the moment
# the engine read its own captured output (installer harness, 2026-11-04).
# Read and write through a handle that tolerates concurrent access instead, and
# retry briefly because the capture file can still be flushing.
function Read-CapturedText {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return "" }
  $deadline = (Get-Date).AddSeconds(15)
  while ($true) {
    try {
      $stream = [System.IO.File]::Open(
        $Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      try {
        $reader = New-Object System.IO.StreamReader($stream)
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
      } finally { $stream.Dispose() }
    } catch {
      if ((Get-Date) -gt $deadline) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
}

function Write-CapturedText {
  param([string]$Path, [string]$Text)
  $stream = [System.IO.File]::Open(
    $Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
  try {
    $stream.SetLength(0)
    $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
    try { $writer.Write($Text) } finally { $writer.Dispose() }
  } finally { $stream.Dispose() }
}

function Redact-File {
  param([string]$File)
  if (-not $File -or $script:Secrets.Count -eq 0) { return }
  if (-not (Test-Path -LiteralPath $File)) { return }
  try {
    $raw = Read-CapturedText $File
    $clean = Redact-Secrets $raw
    if ($clean -ne $raw) { Write-CapturedText -Path $File -Text $clean }
  } catch {
    # The output was already redacted on its way into the install log; this copy
    # is the tool's raw capture. Say so rather than failing silently if it cannot
    # be opened, so an operator can delete it.
    Log "WARN" "Could not redact the captured file '$File': $($_.Exception.Message)"
  }
}

# ------------------------------------------------------- external commands ---

# Runs a native command with a hard timeout while streaming its output into the
# install log. A hung child (a stalled npm download, for example) is killed
# rather than leaving the wizard looking frozen.
# Start-Process joins -ArgumentList with single spaces and quotes nothing. On
# Windows every `*.cmd` shim (`pm2.cmd`, `npm.cmd`) is executed through cmd.exe,
# which splits the resulting command line on spaces before the tool ever sees a
# value. A path such as `C:\...\Default Project\...` therefore arrives as
# `C:\...\Default`, and the tool reports a file it cannot find. The quoting lives
# here, in the one place that builds a command line, so no caller has to
# remember it.
function Format-Argument {
  param([string]$Value)
  if ($null -eq $Value) { return '""' }
  if ($Value -notmatch '[\s"&|<>^()]' -and -not $Value.EndsWith('\')) { return $Value }
  # Windows command-line rules: a backslash is literal except when it precedes
  # a quote, where the run of backslashes must be doubled; a trailing run is
  # doubled so it cannot escape the closing quote.
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

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
  $quotedArguments = @($ArgumentList | ForEach-Object { Format-Argument $_ })
  $startParams = @{
    FilePath               = $FilePath
    ArgumentList           = $quotedArguments
    NoNewWindow            = $true
    PassThru               = $true
    RedirectStandardOutput = $outFile
    RedirectStandardError  = $errFile
  }
  if ($WorkingDirectory) { $startParams["WorkingDirectory"] = $WorkingDirectory }
  Log "INFO" "$LogTag : $FilePath $($quotedArguments -join ' ')"
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
        $content = Read-CapturedText $f
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
  $code = $proc.ExitCode
  # Release PowerShell's own copy of the redirected handles before the capture
  # files are read. A child that outlived the launcher can keep them open, which
  # is why Read-CapturedText shares access; disposing here closes the other half.
  try { $proc.Dispose() } catch { }
  foreach ($pair in @(@($outFile, [ref]$outPos, $LogTag), @($errFile, [ref]$errPos, "$LogTag-ERR"))) {
    $f = $pair[0]; $posRef = $pair[1]; $tag = $pair[2]
    if (-not (Test-Path $f)) { continue }
    try {
      $content = Read-CapturedText $f
      if ($content.Length -gt $posRef.Value) {
        $new = $content.Substring($posRef.Value)
        $posRef.Value = $content.Length
        foreach ($l in ($new -split "`r?`n")) {
          if ($l -and $l.Trim() -ne "") { Log $tag $l }
        }
      }
    } catch { }
  }
  Log "INFO" "$LogTag exit code $code"
  # The streamed lines were redacted on the way into the log; the captured
  # files are scrubbed here so a tool that dumped its environment leaves no
  # copy behind.
  Redact-File $outFile
  Redact-File $errFile
  if ($Quiet) {
    $lines = @()
    if (Test-Path $outFile) { $lines += Read-CapturedText $outFile }
    if (Test-Path $errFile) { $lines += Read-CapturedText $errFile }
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

# ------------------------------------------------------- database target ----

# The engine used to act on the database name alone: it warned when -DbName was
# `cmms` and then ran `prisma migrate deploy` against whatever answered. That
# made an upgrade and an accidental overwrite of a live database the same
# operation. The target is now classified from the server before any file is
# copied, and the action follows the state:

#   Absent       no row in pg_database            -> create, then migrate
#   Empty        exists, no tables in public      -> migrate
#   CommandPulse exists, public._prisma_migrations -> migrate only with -AllowExistingDatabase
#   Foreign      exists, tables, no migration log -> always refuse

# psql runs with -w so it can never prompt: a missing credential fails instead of
# hanging. The password is in PGPASSWORD for the duration of the call and is
# registered for log redaction before it gets there. SQL is piped on stdin
# because Windows PowerShell 5.1 strips embedded double quotes from native
# command arguments, and the identifier `_prisma_migrations` needs them.
function Invoke-PsqlScalar {
  param([string]$Psql, [string]$Database, [string]$Sql)
  if (-not $Psql) { throw "psql not found; cannot query database '$Database'." }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = @($Sql | & $Psql -w -tA -v ON_ERROR_STOP=1 -U $PgUser -h $PgHost -p $PgPort -d $Database 2>&1)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  $text = (@($out) -join "`n").Trim()
  return [pscustomobject]@{ ExitCode = $code; Value = $text }
}

function Get-DatabaseState {
  param([string]$Psql, [string]$Database)
  # The same value is interpolated into CREATE DATABASE and into the connection
  # URL, where psql offers no parameter binding, so it is validated first.
  if ($Database -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
    throw "Database name '$Database' is not a valid PostgreSQL identifier (letters, digits and underscore, starting with a letter or underscore, at most 63 characters)."
  }
  $exists = Invoke-PsqlScalar -Psql $Psql -Database "postgres" -Sql "SELECT 1 FROM pg_database WHERE datname = '$Database';"
  if ($exists.ExitCode -ne 0) { throw "Could not query PostgreSQL for database '$Database': $($exists.Value)" }
  if ($exists.Value -ne "1") {
    return [pscustomobject]@{ Name = $Database; Exists = $false; Kind = "Absent"; TableCount = 0; LastMigration = "" }
  }

  $tables = Invoke-PsqlScalar -Psql $Psql -Database $Database -Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
  if ($tables.ExitCode -ne 0) { throw "Could not read the table list of database '$Database': $($tables.Value)" }
  $tableCount = 0
  [void][int]::TryParse($tables.Value, [ref]$tableCount)

  $migrated = Invoke-PsqlScalar -Psql $Psql -Database $Database -Sql "SELECT to_regclass('public._prisma_migrations') IS NOT NULL;"
  if ($migrated.ExitCode -ne 0) { throw "Could not read the migration history of database '$Database': $($migrated.Value)" }

  $kind = if ($migrated.Value -eq "t") { "CommandPulse" } elseif ($tableCount -eq 0) { "Empty" } else { "Foreign" }
  $last = ""
  if ($kind -eq "CommandPulse") {
    $lastOut = Invoke-PsqlScalar -Psql $Psql -Database $Database -Sql 'SELECT COALESCE((SELECT migration_name FROM public."_prisma_migrations" ORDER BY finished_at DESC NULLS LAST LIMIT 1), '''');'
    if ($lastOut.ExitCode -eq 0) { $last = $lastOut.Value }
  }
  return [pscustomobject]@{ Name = $Database; Exists = $true; Kind = $kind; TableCount = $tableCount; LastMigration = $last }
}

function New-Database {
  param([string]$Psql, [string]$Database)
  Log "INFO" "Database '$Database' does not exist; creating it"
  $created = Invoke-PsqlScalar -Psql $Psql -Database "postgres" -Sql "CREATE DATABASE ""$Database"";"
  if ($created.ExitCode -ne 0) {
    throw "Could not create database '$Database': $($created.Value). Grant CREATEDB to role '$PgUser' or pre-create the database."
  }
  Log "OK" "CREATED database $Database"
}

# Called before Copy-Bundle. A refusal therefore leaves the machine untouched:
# no files copied, no .env written, no migration attempted.
function Assert-DatabaseTarget {
  param([string]$Psql, [string]$Database, [switch]$AllowExisting)
  $state = Get-DatabaseState -Psql $Psql -Database $Database
  switch ($state.Kind) {
    "Absent" {
      New-Database -Psql $Psql -Database $Database
      $state = Get-DatabaseState -Psql $Psql -Database $Database
      Log "OK" "REUSE $($state.Kind) database $Database"
    }
    "Empty" {
      Log "INFO" "Database '$Database' exists and has no tables; migrations will be applied"
      Log "OK" "REUSE EMPTY database $Database"
    }
    "CommandPulse" {
      if (-not $AllowExisting) {
        Log "ERR" "Database '$Database' already exists and is a CommandPulse CMMS database (last applied migration: $($state.LastMigration))."
        Log "ERR" "Refusing to apply migrations to it without confirmation. Re-run with -AllowExistingDatabase to upgrade it, or pass a new -DbName."
        Log "ERR" "Nothing was copied and no migration was attempted."
        exit 4
      }
      Log "WARN" "Database '$Database' already exists (CommandPulse, last applied migration: $($state.LastMigration)); upgrading because -AllowExistingDatabase was passed"
      Log "OK" "UPGRADE database $Database"
    }
    "Foreign" {
      Log "ERR" "Database '$Database' already exists with $($state.TableCount) table(s) in schema public and no CommandPulse migration history."
      Log "ERR" "Refusing to modify a database this installer does not own, with or without -AllowExistingDatabase. Pass a new -DbName."
      Log "ERR" "Nothing was copied and no migration was attempted."
      exit 4
    }
    default {
      throw "Unexpected database state '$($state.Kind)' for '$Database'."
    }
  }
  return $state
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

# Which process is listening on the port. Needed so an upgrade can tell "the
# port is held by the application this install is about to replace" (expected,
# and restarted in place) from "the port is held by something else" (a real
# conflict that the health check would mask).
function Get-PortOwnerPid {
  param([int]$Port)
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
    return $null
  }
  $line = (& netstat -ano 2>$null | Select-String -Pattern (":$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") | Select-Object -First 1)
  if ($line -and "$line" -match 'LISTENING\s+(\d+)\s*$') { return [int]$Matches[1] }
  return $null
}

# The processes this install would own, if one of them holds the port. Two
# shapes exist: a 1.6.8 install runs as a Windows service, so the listener is a
# descendant of a CommandPulseCMMS*.exe wrapper; a 1.6.x install runs under PM2,
# so the listener is the process `pm2 pid <name>` reports.
function Get-OwnAppPids {
  param([int]$Port)
  $owner = Get-PortOwnerPid -Port $Port
  if (-not $owner) { return @() }

  $cursor = [int]$owner
  for ($depth = 0; $depth -lt 6 -and $cursor -gt 0; $depth++) {
    $proc = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $cursor) -ErrorAction SilentlyContinue
    if (-not $proc) { break }
    if ($proc.Name -match '^CommandPulseCMMS.*\.exe$') { return @([int]$owner) }
    $cursor = [int]$proc.ParentProcessId
  }

  $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
  if (-not $pm2) { return @() }
  $found = @()
  foreach ($name in (Get-AppNames -Prefix $AppNamePrefix)) {
    $out = Invoke-External -FilePath $pm2 -ArgumentList @("pid", $name) -WorkingDirectory $script:LogDir -TimeoutSeconds 30 -LogTag "PM2PID" -Quiet
    $text = (($out.Lines -join "`n")).Trim()
    if ($out.ExitCode -eq 0 -and $text -match '^\d+$' -and [int]$text -eq $owner) { $found += [int]$text }
  }
  return $found
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
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Log "ERR" "Registering the CommandPulse CMMS Windows services requires an elevated PowerShell window. Right-click PowerShell, choose 'Run as administrator', and re-run."
    $hard = $true
  } else { Log "OK" "Running elevated" }
  $node = Get-CmdPath @("node.exe", "node")
  if (-not $node) { Log "ERR" "Node.js not found. Install Node.js 24 LTS from https://nodejs.org/ and re-run."; $hard = $true }
  else {
    $v = (& $node --version 2>&1 | Select-Object -First 1)
    Log "OK" "Node.js $v"
    if ("$v" -notmatch '^v(2[4-9]|[3-9][0-9])\.') { Log "WARN" "Node.js 24 LTS or newer is recommended; found $v" }
  }
  $npm = Get-CmdPath @("npm.cmd", "npm")
  if (-not $npm) { Log "ERR" "npm not found. It ships with Node.js."; $hard = $true } else { Log "OK" "npm $(& $npm --version 2>&1 | Select-Object -First 1)" }
  # The service wrapper is shipped in the bundle; it needs .NET Framework 4.6.1
  # or newer (release 394254). Windows 10 and Server 2016+ include it.
  $winsw = Join-Path $PSScriptRoot "tools\winsw\WinSW.NET461.exe"
  if (-not (Test-Path -LiteralPath $winsw)) {
    Log "ERR" "The Windows service wrapper is missing from the bundle: $winsw"
    $hard = $true
  } else {
    $release = $null
    try { $release = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction Stop).Release } catch { }
    if (-not $release) {
      Log "ERR" ".NET Framework 4.6.1 or newer is required to run the CommandPulse CMMS Windows services. Install it from https://dotnet.microsoft.com/download/dotnet-framework and re-run."
      $hard = $true
    } elseif ([int]$release -lt 394254) {
      Log "ERR" ".NET Framework 4.6.1 or newer is required; this host reports release $release. Install it and re-run."
      $hard = $true
    } else { Log "OK" ".NET Framework release $release (WinSW wrapper present)" }
  }
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
  # A blank instance must never receive a database dump, but only files the
  # BUNDLE itself delivered are removed. A *.sql that was already in the install
  # root belongs to the operator - a backups folder, a hand-made dump - and
  # deleting it is data loss, not hygiene. On 2026-11-01 this sweep deleted the
  # production dumps in <root>\backups because the install root was also the
  # repository checkout. The list is taken from the bundle, so what is removed is
  # exactly what the bundle carried (the Prisma migrations are the schema
  # history, not a data dump, and are kept).
  $bundleRoot = (Resolve-Path -LiteralPath $Bundle).Path
  $bundledDumps = @(Get-ChildItem -LiteralPath $bundleRoot -Recurse -File -Filter "*.sql" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '[\\/]prisma[\\/]migrations[\\/]' } |
    ForEach-Object { $_.FullName.Substring($bundleRoot.Length).TrimStart('\') })
  if (Test-Path -LiteralPath (Join-Path $bundleRoot "database")) {
    Log "WARN" "  the bundle carries database\; it is not copied (a blank instance carries no data)"
  }
  if (Test-Path -LiteralPath (Join-Path $Root "database")) {
    Log "WARN" "  $Root\database exists and is left untouched (it did not come from this bundle)"
  }
  foreach ($rel in $bundledDumps) {
    $copied = Join-Path $Root $rel
    if (Test-Path -LiteralPath $copied) {
      Remove-Item -LiteralPath $copied -Force
      Log "INFO" "  excluded bundled dump file $rel"
    }
  }
  # The published bundle ships env templates and a sample (backend\.env.deploy,
  # backend\.env.example). The install generates its own .env, so neither may
  # reach the install root: left beside the real .env they look like it, carry
  # placeholders such as your_password and <PGPASSWORD>, and invite an operator
  # to "fix" a configuration that is already correct. Removing every backend env
  # file except the generated .env is the only rule that cannot be forgotten when
  # a new template is added to the bundle.
  #
  # Two names are deliberately kept:
  #   backend\.env            - New-BackendEnv backs it up and then rewrites it;
  #                             deleting it here is what destroyed the live
  #                             secret on 2026-11-01, because the backup step
  #                             runs after this sweep.
  #   backend\.env.bak.<stamp> - the rollback copy of a previous upgrade.
  # The filter is applied to the NAME: `Get-ChildItem -Filter '.env.*'` also
  # matches '.env' itself on this host, which is the quirk that made the backup
  # impossible in the first place.
  $backendRoot = Join-Path $Root "backend"
  if (Test-Path -LiteralPath $backendRoot) {
    Get-ChildItem -LiteralPath $backendRoot -Force -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like ".env.*" -and $_.Name -ne ".env" -and $_.Name -notlike ".env.bak.*" } |
      ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
        Log "INFO" "  removed backend\$($_.Name) (the installer generates backend\.env)"
      }
  }
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

# The folder IIS actually serves is NOT the install root's site\ folder. An
# upgrade that replaced the backend but left that folder alone would serve a
# frontend from an older release - the drift found on 2026-11-01, where the API
# ran the 2026-10-31 build while the IIS site still held whatever had been copied
# by hand. The target is resolved from the site NAME with appcmd, so no path is
# hardcoded, and an existing web.config is preserved because it carries the
# host's own proxy binding.
function Get-WebSitePath {
  param([string]$Name)
  if (-not $Name) { return $null }
  $appcmd = Join-Path $env:SystemRoot "System32\inetsrv\appcmd.exe"
  if (-not (Test-Path -LiteralPath $appcmd)) { return $null }
  $out = & $appcmd list vdir "$Name/" 2>$null
  if (-not $out) { return $null }
  if ("$out" -match 'physicalPath:([^,)]+)') { return $Matches[1].Trim() }
  return $null
}

function Deploy-Site {
  param([string]$Root, [string]$Target)
  $source = Join-Path $Root "site"
  if (-not (Test-Path -LiteralPath (Join-Path $source "index.html"))) {
    Log "WARN" "No compiled frontend under $source; the web server was not updated"
    return "skipped"
  }
  if (-not $Target) { $Target = Get-WebSitePath -Name $SiteName }
  if (-not $Target) {
    Log "WARN" "No IIS site named '$SiteName' on this host, so the compiled frontend was not deployed. Pass -SitePath to name the folder the web server serves."
    return "skipped"
  }
  if (-not (Test-Path -LiteralPath $Target)) {
    Log "WARN" "Site folder '$Target' does not exist; nothing was deployed"
    return "skipped"
  }
  $fullTarget = (Resolve-Path -LiteralPath $Target).Path.TrimEnd('\')
  $fullSource = (Resolve-Path -LiteralPath $source).Path.TrimEnd('\')
  if ($fullTarget -ieq $fullSource) {
    Log "INFO" "$fullTarget is the install's own site folder; nothing to deploy"
    return "skipped"
  }
  # A mistyped -SitePath must not be able to empty a drive root or the Windows
  # folder: this step removes <target>\assets before it copies.
  if ($fullTarget -match '^[A-Za-z]:$' -or $fullTarget -ieq $env:SystemRoot) {
    throw "Refusing to deploy the frontend into $fullTarget"
  }

  Log "INFO" "=== Frontend deployment ==="
  # Hashed asset names change every release, so the old set is removed rather
  # than left to accumulate beside the new one.
  $assets = Join-Path $fullTarget "assets"
  if (Test-Path -LiteralPath $assets) { Remove-Item -LiteralPath $assets -Recurse -Force }

  # web.config is handled on its own below: the host's copy is the reverse proxy
  # binding, and a bundle copy built for another host would repoint it.
  $copied = 0
  foreach ($f in Get-ChildItem -LiteralPath $source -Recurse -File) {
    $rel = $f.FullName.Substring($source.Length).TrimStart('\')
    if ($rel -ieq "web.config") { continue }
    $dst = Join-Path $fullTarget $rel
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
    $copied++
  }

  $liveWebConfig = Join-Path $fullTarget "web.config"
  $bundleWebConfig = Join-Path $source "web.config"
  if (Test-Path -LiteralPath $liveWebConfig) {
    if ((Test-Path -LiteralPath $bundleWebConfig) -and
        ((Get-FileHash -LiteralPath $liveWebConfig -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $bundleWebConfig -Algorithm SHA256).Hash)) {
      Log "WARN" "The site's web.config differs from the bundle's; the site's own copy was kept because it carries this host's proxy binding"
    }
  } elseif (Test-Path -LiteralPath $bundleWebConfig) {
    Copy-Item -LiteralPath $bundleWebConfig -Destination $liveWebConfig -Force
    Log "INFO" "  the site had no web.config; the bundle's copy was installed"
  }

  # Evidence, not assumption: every file the release ships must now be the file
  # the web server serves.
  $checked = 0
  $mismatch = @()
  foreach ($f in Get-ChildItem -LiteralPath $source -Recurse -File) {
    $rel = $f.FullName.Substring($source.Length).TrimStart('\')
    if ($rel -ieq "web.config") { continue }
    $dst = Join-Path $fullTarget $rel
    $checked++
    if (-not (Test-Path -LiteralPath $dst)) { $mismatch += $rel; continue }
    if ((Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash) { $mismatch += $rel }
  }
  if ($mismatch.Count -gt 0) { throw "The deployed frontend does not match the bundle: $($mismatch -join ', ')" }
  Log "OK" "Frontend deployed to $fullTarget ($copied files copied, $checked verified)"
  return "updated"
}

# A staged dependency install leaves the previous tree behind as rollback
# material. It is only removed once the new application has answered its health
# check.
function Remove-InstallStaging {
  param([string]$BackendDir)
  $stale = @(Get-ChildItem -LiteralPath $BackendDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq ".install-stage" -or $_.Name -like "node_modules.previous-*" })
  foreach ($d in $stale) {
    $mb = ((Get-ChildItem -LiteralPath $d.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB
    Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $d.FullName) {
      Log "WARN" "Could not remove $($d.Name); remove it by hand to reclaim the space"
    } else {
      Log "INFO" ("Removed {0} ({1:N0} MB)" -f $d.Name, $mb)
    }
  }
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
    # The upgrade path rewrites .env, and the previous file holds the only copy
    # of the JWT secret and database password. Copy-Bundle deliberately leaves it
    # in place so this backup can happen; the copy is then given the same ACL as
    # the original, because a fresh copy inherits the folder's permissions and
    # would otherwise be readable by every local user.
    $backup = "$envPath.bak.$script:RunStamp"
    Copy-Item -LiteralPath $envPath -Destination $backup -Force
    Protect-EnvFile -EnvFile $backup
    Log "OK" "Existing .env backed up to $backup"
    # Each upgrade leaves one more copy of the same secrets. Five is enough to
    # undo the last few upgrades by hand and few enough to stay auditable.
    $old = @(Get-ChildItem -LiteralPath $BackendDir -Force -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like ".env.bak.*" } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 5)
    foreach ($f in $old) {
      Remove-Item -LiteralPath $f.FullName -Force
      Log "INFO" "Removed the superseded .env backup $($f.Name)"
    }
  }
  # Guard: the substitution table above is hand-written, so a token added to the
  # template without a matching .Replace() would ship an unsubstituted value and
  # the install would start with a literal __DATABASE_URL__ as its connection
  # string. Fail here, where the cause is obvious, rather than at first request.
  $leftover = @([regex]::Matches($content, '__[A-Z0-9_]+__') | ForEach-Object { $_.Value } | Sort-Object -Unique)
  if ($leftover.Count -gt 0) {
    throw "The generated .env still contains template tokens: $($leftover -join ', '). Add a .Replace() for each in New-BackendEnv."
  }
  foreach ($sample in @('your_password', '<PGPASSWORD>', 'change-this-to-a-random-secret-key')) {
    if ($content.Contains($sample)) {
      throw "The generated .env still contains the example value '$sample'."
    }
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
  # `Set-Acl` demands SeSecurityPrivilege when the file already carries an explicit
  # DACL. Reproduced 2026-11-02 on an existing .env: it applied the ACL and then
  # threw PrivilegeNotHeld, which aborted the upgrade after the .env had been
  # rewritten. The .NET method writes the DACL and is idempotent, so the same call
  # works on a fresh install and on every upgrade.
  $item = Get-Item -LiteralPath $EnvFile -Force
  $item.SetAccessControl($acl)
  $verify = Get-Acl -LiteralPath $EnvFile
  $trustees = @($verify.Access | ForEach-Object { $_.IdentityReference.Value })
  $expected = @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators", $currentName)
  $missing = @($expected | Where-Object { $trustees -notcontains $_ })
  $extra = @($trustees | Where-Object { $expected -notcontains $_ })
  if ($missing.Count -gt 0) { throw "Could not grant the required access to: $($missing -join ', ')" }
  if ($extra.Count -gt 0) { throw "Unexpected access remains on the .env: $($extra -join ', ')" }
  Log "OK" "Access restricted to: $($trustees -join ', ')"
}

# --------------------------------------------------- application services ---

# The PM2 application names an OLD (1.6.x) install may still use. Kept so an
# upgrade can stop those before it swaps node_modules, and so the port check can
# recognise a legacy process it owns.
function Get-AppNames {
  param([string]$Prefix)
  # "${Prefix}api" and not "$Prefix" + "api": the comma operator binds tighter
  # than `+` in PowerShell, so the concatenating form collapses into ONE string
  # ("cmmstest1-api cmmstest1-worker") and every `pm2 describe`/`pid`/`delete`
  # then addresses an application that does not exist. Found by the harness
  # 2026-11-01; the live install was unaffected only because it uses no prefix.
  if ($Prefix) { return @("${Prefix}api", "${Prefix}worker") }
  return @("cmms-api", "cmms-worker")
}

# The Windows service names this install owns. This mirrors Get-CmmsServiceNames
# in installer\service\Install-CmmsServices.ps1, which is the authority; the
# prefix is stripped to alphanumerics there, so it must be stripped here too.
function Get-ServiceNames {
  param([string]$Prefix)
  $clean = ""
  if ($Prefix) { $clean = ($Prefix -replace '[^A-Za-z0-9]', '') }
  return [pscustomobject]@{
    Api    = "CommandPulseCMMS${clean}API"
    Worker = "CommandPulseCMMS${clean}Worker"
  }
}

# Runs installer\service\Install-CmmsServices.ps1 as a CHILD process. It is not
# dot-sourced: that script declares its own param() block, and dot-sourcing would
# overwrite this installer's variables (-Mode, -ApiPort, -PgHost, ...).
function Invoke-CmmsServiceScript {
  param(
    [Parameter(Mandatory)][ValidateSet("install", "remove", "status", "stop", "start")][string]$Mode,
    [string]$BackendDir = "",
    [int]$Port = 4000,
    [string]$Bind = "127.0.0.1",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432,
    [string]$Prefix = "",
    [string]$Account = "LocalSystem",
    [SecureString]$AccountPassword,
    [switch]$SkipHealth,
    [switch]$SkipWatchdog,
    [switch]$DependOnPostgres
  )
  $serviceScript = Join-Path $PSScriptRoot "service\Install-CmmsServices.ps1"
  if (-not (Test-Path -LiteralPath $serviceScript)) {
    throw "The service installer is missing from the bundle: $serviceScript"
  }
  $powershell = Join-Path $env:windir "System32\WindowsPowerShell\v1.0\powershell.exe"
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $serviceScript, "-Mode", $Mode)
  if ($BackendDir) { $argList += @("-BackendDir", $BackendDir) }
  if ($Mode -in @("install", "start")) {
    $argList += @("-ApiPort", [string]$Port, "-PgPort", [string]$PgPort)
  }
  if ($Mode -eq "install") {
    $argList += @("-BindHost", $Bind, "-PgHost", $PgHost, "-ServiceAccount", $Account)
    if ($Prefix) { $argList += @("-ServicePrefix", $Prefix) }
  }
  if ($Prefix -and $Mode -in @("remove", "stop", "status")) { $argList += @("-ServicePrefix", $Prefix) }
  if ($SkipHealth) { $argList += @("-SkipHealthCheck") }
  if ($SkipWatchdog) { $argList += @("-SkipWatchdog") }
  if ($DependOnPostgres) { $argList += @("-DependOnPostgres") }

  # The account password travels in the environment, not on the command line,
  # because command lines are visible to other processes on the host.
  $hadPasswordEnv = Test-Path Env:\CMMS_SERVICE_ACCOUNT_PASSWORD
  $previousPasswordEnv = $env:CMMS_SERVICE_ACCOUNT_PASSWORD
  if ($AccountPassword) {
    $env:CMMS_SERVICE_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AccountPassword))
  }
  try {
    $result = Invoke-External -FilePath $powershell -ArgumentList $argList -WorkingDirectory $PSScriptRoot -TimeoutSeconds 1800 -LogTag ("SERVICE-" + $Mode.ToUpperInvariant()) -Quiet
  } finally {
    if ($hadPasswordEnv) { $env:CMMS_SERVICE_ACCOUNT_PASSWORD = $previousPasswordEnv }
    else { Remove-Item Env:\CMMS_SERVICE_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue }
  }
  foreach ($line in $result.Lines) { if ($line.Trim()) { Log "SERVICE" (Redact-Secrets $line.Trim()) } }
  if ($result.ExitCode -ne 0) {
    throw "The service script failed in mode '$Mode' with exit code $($result.ExitCode). See the SERVICE output above."
  }
  return $result
}

# Stops whatever this install currently runs, so node_modules can be swapped.
# A 1.6.x install runs under PM2 and a 1.6.8 install runs as Windows services;
# during the upgrade from one to the other either - or both - can be present.
function Stop-OwnApplications {
  param([string]$BackendDir)
  Invoke-CmmsServiceScript -Mode stop -BackendDir $BackendDir -Prefix $AppNamePrefix
  $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
  if (-not $pm2) { return }
  foreach ($name in (Get-AppNames -Prefix $AppNamePrefix)) {
    $state = Get-Pm2AppState -Pm2Path $pm2 -WorkingDir $BackendDir -Name $name
    if ($state -and $state.Status -eq "online") {
      Log "INFO" "Stopping the legacy PM2 application '$name' (no save)"
      Invoke-External -FilePath $pm2 -ArgumentList @("stop", $name) -WorkingDirectory $BackendDir -TimeoutSeconds 120 -LogTag "PM2STOP" | Out-Null
    }
  }
}

# Puts back whatever was running if an upgrade step fails after the swap.
function Start-OwnApplications {
  param([string]$BackendDir)
  $names = Get-ServiceNames -Prefix $AppNamePrefix
  if (Get-Service -Name $names.Api -ErrorAction SilentlyContinue) {
    Invoke-CmmsServiceScript -Mode start -BackendDir $BackendDir -Port $ApiPort -Prefix $AppNamePrefix -SkipHealth
    return
  }
  $pm2 = Get-CmdPath @("pm2.cmd", "pm2")
  if ($pm2) {
    Invoke-External -FilePath $pm2 -ArgumentList (@("start") + (Get-AppNames -Prefix $AppNamePrefix)) -WorkingDirectory $BackendDir -TimeoutSeconds 300 -LogTag "PM2ROLLBACK" | Out-Null
  }
}

function Test-ServiceApps {
  param([int]$Port)
  $names = Get-ServiceNames -Prefix $AppNamePrefix
  $allRunning = $true
  foreach ($id in @($names.Api, $names.Worker)) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if (-not $svc) { Log "ERR" "Windows service '$id' does not exist"; $allRunning = $false; continue }
    if ($svc.Status -ne "Running") { Log "ERR" "Windows service '$id' is '$($svc.Status)', not 'Running'"; $allRunning = $false; continue }
    $wmi = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $id) -ErrorAction SilentlyContinue
    Log "OK" "Windows service '$id' is Running (pid $($wmi.ProcessId), start $($svc.StartType), account $($wmi.StartName))"
    if ($svc.StartType -ne "Automatic") { Log "WARN" "Windows service '$id' is not Automatic; it will not start at boot" }
  }
  return $allRunning
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

# `npm ci` deletes node_modules before it installs anything, so running it in a
# live backend takes the application's dependencies away and puts them back only
# if the install succeeds. On Windows it usually cannot succeed at all: the
# running process has the Prisma engine DLL mapped and the delete fails with
# EPERM (proved 2026-11-01 on a scratch instance, npm exit -4048, and the tree
# was left without express). Dependencies for an upgrade are therefore installed
# into a staging folder while the application keeps serving, and swapped in with
# two directory renames at the very end.
#
# A rename of a directory holding a mapped DLL fails until the holder is gone, so
# the swap retries for several seconds. That is the difference between an upgrade
# that needs a retry and one that needs a reboot.
function Move-DirectoryWithRetry {
  param([string]$From, [string]$To, [int]$Attempts = 20)
  $last = $null
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      Move-Item -LiteralPath $From -Destination $To -ErrorAction Stop
      return
    } catch {
      $last = $_
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Could not move '$From' to '$To' after $($Attempts * 0.5) seconds (a process may still hold a file open): $($last.Exception.Message)"
}

function Install-Backend {
  param([string]$BackendDir, [switch]$AppsRunning)
  Log "INFO" "=== Backend setup ==="
  $npm = Get-CmdPath @("npm.cmd", "npm")
  $npx = Get-CmdPath @("npx.cmd", "npx")
  if (-not $npm) { throw "npm not found" }
  if (-not $npx) { throw "npx not found" }

  if (-not $AppsRunning) {
    $code = Invoke-External -FilePath $npm -ArgumentList @("ci", "--foreground-scripts") -WorkingDirectory $BackendDir -TimeoutSeconds 1800 -LogTag "NPMCI"
    if ($code -ne 0) { throw "npm ci failed with exit code $code" }
    Log "OK" "Dependencies installed"
    $enginesOk = Install-PrismaEngines -BackendDir $BackendDir
    $code = Invoke-External -FilePath $npx -ArgumentList @("prisma", "generate") -WorkingDirectory $BackendDir -TimeoutSeconds 900 -LogTag "PRISMA"
    if ($code -ne 0) {
      if ($enginesOk) { throw "prisma generate failed with exit code $code" }
      throw "prisma generate failed with exit code $code. The Prisma engine binaries could not be downloaded from binaries.prisma.sh. Re-run with -PrismaEnginesPath pointing at a folder holding the prebuilt engines, on a host with access to binaries.prisma.sh, or copy node_modules\.prisma from a prepared install."
    }
    Log "OK" "Prisma client generated"
    $code = Invoke-External -FilePath $npx -ArgumentList @("prisma", "migrate", "deploy") -WorkingDirectory $BackendDir -TimeoutSeconds 900 -LogTag "MIGRATE"
    if ($code -ne 0) { throw "prisma migrate deploy failed with exit code $code" }
    Log "OK" "Database schema applied"
    return
  }

  # --- upgrade with the application online -------------------------------
  # Everything that takes minutes happens while the old application serves: the
  # dependency install and the client generation are done in the stage, and the
  # migration runs against the database. Only the swap needs the applications
  # stopped, and it is two renames plus a start.
  $stage = Join-Path $BackendDir ".install-stage"
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  foreach ($f in @("package.json", "package-lock.json")) {
    $src = Join-Path $BackendDir $f
    if (-not (Test-Path -LiteralPath $src)) { throw "The install has no $f; a staged upgrade needs the bundle's lock file." }
    Copy-Item -LiteralPath $src -Destination $stage -Force
  }
  # prisma\ travels with the stage so that `prisma generate` resolves the client
  # into the staged tree instead of the live one.
  $schemaDir = Join-Path $BackendDir "prisma"
  if (-not (Test-Path -LiteralPath $schemaDir)) { throw "The install has no prisma\ folder; a staged upgrade needs the schema." }
  Copy-Item -LiteralPath $schemaDir -Destination $stage -Recurse -Force

  Log "INFO" "Staging dependencies in $stage (the application keeps serving)"
  $code = Invoke-External -FilePath $npm -ArgumentList @("ci", "--foreground-scripts") -WorkingDirectory $stage -TimeoutSeconds 1800 -LogTag "NPMCI-STAGE"
  if ($code -ne 0) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    throw "npm ci failed with exit code $code. The installed application was not touched and is still running."
  }
  Log "OK" "Dependencies staged"

  $enginesOk = Install-PrismaEngines -BackendDir $stage
  $code = Invoke-External -FilePath $npx -ArgumentList @("prisma", "generate") -WorkingDirectory $stage -TimeoutSeconds 900 -LogTag "PRISMA-STAGE"
  if ($code -ne 0) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    if ($enginesOk) { throw "prisma generate failed with exit code $code. The installed application was not touched and is still running." }
    throw "prisma generate failed with exit code $code. The engine binaries could not be downloaded and -PrismaEnginesPath was not usable. The installed application was not touched and is still running."
  }
  Log "OK" "Prisma client staged"

  # The migration uses the staged CLI and the install's own .env, so it runs
  # before the application is stopped. A migration that fails leaves the old
  # application serving its old code against the old schema.
  $stagedPrisma = Join-Path $stage "node_modules\.bin\prisma.cmd"
  if (-not (Test-Path -LiteralPath $stagedPrisma)) { throw "The staged install has no Prisma CLI at $stagedPrisma" }
  $code = Invoke-External -FilePath $stagedPrisma -ArgumentList @("migrate", "deploy") -WorkingDirectory $BackendDir -TimeoutSeconds 900 -LogTag "MIGRATE"
  if ($code -ne 0) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    throw "prisma migrate deploy failed with exit code $code. The installed application was not touched and is still running."
  }
  Log "OK" "Database schema applied"

  $nodeModules = Join-Path $BackendDir "node_modules"
  $retired = Join-Path $BackendDir ("node_modules.previous-" + $script:RunStamp)

  Log "INFO" "Stopping the application for the dependency swap"
  Stop-OwnApplications -BackendDir $BackendDir
  # `Stop-Service` returns when SCM reports Stopped, and `pm2 stop` returns when
  # the process is signalled, but Windows can hold the mapped Prisma engine DLL
  # for a moment longer. The rename is retried for a few seconds instead of
  # failing the upgrade (the same EPERM that makes an in-place `npm ci` fail).
  Start-Sleep -Milliseconds 800

  $swapped = $false
  $failed = $null
  try {
    if (Test-Path -LiteralPath $retired) { Remove-Item -LiteralPath $retired -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $nodeModules) { Move-DirectoryWithRetry -From $nodeModules -To $retired }
    Move-DirectoryWithRetry -From (Join-Path $stage "node_modules") -To $nodeModules
    $swapped = $true
    # A ready-built Prisma client was staged, but generating again from the
    # installed tree is the only way to prove the client matches this install
    # root; it takes a few seconds and runs with nothing holding the tree.
    $code = Invoke-External -FilePath $npx -ArgumentList @("prisma", "generate") -WorkingDirectory $BackendDir -TimeoutSeconds 900 -LogTag "PRISMA"
    if ($code -ne 0) { throw "prisma generate failed with exit code $code" }
    Log "OK" "Prisma client generated in the installed tree"
  } catch {
    $failed = $_
  }

  if ($failed) {
    Log "ERR" "Swapping the dependencies in failed: $($failed.Exception.Message)"
    if ($swapped -and (Test-Path -LiteralPath $nodeModules)) {
      Remove-Item -LiteralPath $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path -LiteralPath $nodeModules) -and (Test-Path -LiteralPath $retired)) {
      Move-DirectoryWithRetry -From $retired -To $nodeModules
      Log "WARN" "The previous dependencies are back in place"
    }
    Log "WARN" "Starting the previous application"
    try { Start-OwnApplications -BackendDir $BackendDir }
    catch { Log "ERR" "The previous application could not be restarted automatically: $($_.Exception.Message)" }
    throw "The dependency swap failed; the previous dependencies and applications were restored. $($failed.Exception.Message)"
  }

  # The retired tree is the rollback material until the new application answers
  # its health check, so it is left for the main flow to remove.
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  Log "OK" "Dependencies in place (previous tree kept at $retired until the health check passes)"
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

# -------------------------------------------------- start the application ---

# Registers (or refreshes) the two Windows services and brings them up. The
# service wrapper, the service XML and the watchdog are the service script's
# responsibility; this function only decides that they are wanted and forwards
# the install's parameters.
function Start-Application {
  param([string]$BackendDir)
  $names = Get-ServiceNames -Prefix $AppNamePrefix
  Log "INFO" "=== Registering the Windows services ==="

  # A failed registration must not leave a host with no service at all. On an
  # upgrade the previous application is still running at this point: the
  # service script stops and removes a legacy PM2 pair only after the new
  # service is installed, and WinSW refuses a second copy of the same service.
  # Nothing is deleted here, so a throw leaves the existing service untouched.
  Invoke-CmmsServiceScript -Mode install -BackendDir $BackendDir -Port $ApiPort -Bind $BindHost `
    -PgHost $PgHost -PgPort $PgPort -Prefix $AppNamePrefix -Account $ServiceAccount `
    -AccountPassword $ServiceAccountPassword -DependOnPostgres:$DependOnPostgres

  $allRunning = Test-ServiceApps -Port $ApiPort
  if (-not $allRunning) {
    throw "The Windows services '$($names.Api)' and '$($names.Worker)' are not both running. See the SERVICE output above."
  }
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
  # `pm2 start <ecosystem>` restarts the script PM2 has registered for a name and
  # ignores the file's `script` field, so the registered path decides whether a
  # replacement can be a restart or has to be a delete-and-start. The table is
  # drawn with U+2502; the plain `|` and a drive-letter fallback keep the parse
  # working if the console encoding could not be set to UTF-8.
  $scriptPath = ""
  $scriptLine = ($text -split "`r?`n" | Where-Object { $_ -match 'script path' } | Select-Object -First 1)
  if ($scriptLine -and $scriptLine -match 'script path\s*[\u2502|]\s*(.+?)\s*[\u2502|]?\s*$') {
    $scriptPath = $Matches[1].Trim()
  } elseif ($scriptLine -and $scriptLine -match '(?i)([A-Za-z]:\\.*?\.(?:js|cjs|mjs|exe))') {
    $scriptPath = $Matches[1]
  }
  $execCwd = ""
  $cwdLine = ($text -split "`r?`n" | Where-Object { $_ -match 'exec cwd' } | Select-Object -First 1)
  if ($cwdLine -and $cwdLine -match 'exec cwd\s*[\u2502|]\s*(.+?)\s*[\u2502|]?\s*$') { $execCwd = $Matches[1].Trim() }
  $procId = 0
  $pidOut = Invoke-External -FilePath $Pm2Path -ArgumentList @("pid", $Name) -WorkingDirectory $WorkingDir -TimeoutSeconds 30 -LogTag "PM2PID" -Quiet
  $pidText = (($pidOut.Lines -join "`n")).Trim()
  if ($pidText -match '^\d+$') { $procId = [int]$pidText }
  return [pscustomobject]@{ Name = $Name; Status = $status; Pid = $procId; ScriptPath = $scriptPath; Cwd = $execCwd }
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
  Log "INFO" "API endpoint : http://$BindHost`:$ApiPort"
  Log "INFO" "Identity     : $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"

  # `probe` answers one question - what is this database? - and writes nothing.
  # It does not need Node, IIS or a bundle, so it is handled before the
  # full-mode preflight. The wizard calls it before it copies anything.
  if ($Mode -eq "probe") {
    $psql = Get-PsqlPath
    if (-not $psql) { throw "psql not found. Install PostgreSQL 15+ and add its bin folder to PATH." }
    $plainPassword = Resolve-PgPassword
    Add-Secret $plainPassword
    $previousPgPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $plainPassword
    try { $state = Get-DatabaseState -Psql $psql -Database $DbName }
    finally { $env:PGPASSWORD = $previousPgPassword }
    $json = [pscustomobject]@{
      database      = $state.Name
      exists        = $state.Exists
      kind          = $state.Kind
      tableCount    = $state.TableCount
      lastMigration = $state.LastMigration
    } | ConvertTo-Json -Compress
    Log "OK" "PROBE $json"
    if ($ProbeOut) {
      [System.IO.File]::WriteAllText($ProbeOut, $json)
      Log "INFO" "Probe written to $ProbeOut"
    }
    Log "INFO" "Engine finished (probe)"
    exit 0
  }

  if ($Mode -eq "verify") {
    if (Test-Health -Port $ApiPort) { Log "INFO" "Engine finished (verify)"; exit 0 }
    Log "ERR" "Health check failed"; exit 2
  }

  if ($Mode -eq "uninstall") {
    Invoke-Uninstall -Root $InstallRoot
    Log "INFO" "Engine finished (uninstall)"; exit 0
  }

  Test-Prerequisites
  # An upgrade restarts this install's own application in place, so a port held
  # BY THAT APPLICATION is expected - whether it is the Windows service or a
  # legacy PM2 process. Any other holder is a real conflict: the health check
  # could otherwise be answered by a different service.
  $appsRunning = $false
  if (Test-PortInUse -Port $ApiPort) {
    $ownPids = @(Get-OwnAppPids -Port $ApiPort)
    if ($ownPids.Count -eq 0) {
      throw "TCP port $ApiPort is already in use on 127.0.0.1 by a process this install does not own. Pass a free -ApiPort so the health check cannot be answered by a different service."
    }
    $appsRunning = $true
    Log "OK" "API port $ApiPort is held by this install's own application (pid $($ownPids -join ', ')); the upgrade replaces it in place"
  } else {
    Log "OK" "API port $ApiPort is free"
  }
  Test-BundleIntegrity -Bundle $SourceBundle

  # The database decision comes before any file is copied. A refusal (exit 4)
  # therefore leaves the install root, the target database and the host
  # untouched. The credential is resolved here rather than after Copy-Bundle
  # because the check needs it; Add-Secret registers it for log redaction first.
  $plainPassword = Resolve-PgPassword
  Add-Secret $plainPassword
  $psql = Get-PsqlPath
  $previousPgPassword = $env:PGPASSWORD
  $env:PGPASSWORD = $plainPassword
  try {
    Assert-DatabaseTarget -Psql $psql -Database $DbName -AllowExisting:$AllowExistingDatabase | Out-Null
  } finally {
    $env:PGPASSWORD = $previousPgPassword
  }

  Copy-Bundle -Bundle $SourceBundle -Root $InstallRoot

  $backendDir = Join-Path $InstallRoot "backend"
  if (-not (Test-Path -LiteralPath $backendDir)) { throw "The bundle has no backend\ folder; $InstallRoot is not a valid install root." }
  New-SiteFolder -Root $InstallRoot | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir "logs") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir "uploads") | Out-Null

  New-BackendEnv -BackendDir $backendDir -PlainPassword $plainPassword | Out-Null
  $plainPassword = $null

  Install-Backend -BackendDir $backendDir -AppsRunning:$appsRunning
  New-Administrator -BackendDir $backendDir
  Start-Application -BackendDir $backendDir

  # A service can be registered and Running while its child crashes on the
  # first tick, so the service state is checked before the health check. A
  # stopped service is reported as a failed install rather than being left to
  # time out.
  $appsOnline = Test-ServiceApps -Port $ApiPort

  $healthy = Test-Health -Port $ApiPort

  # The site folder inside the install root is not what the browser loads: the web
  # server serves its own physical path. That folder is updated only once the new
  # API is answering, so the browser never gets a new build pointed at an old
  # backend. A failure here does not abort an install whose application is fine;
  # it changes the exit code at the end.
  $siteStatus = "skipped"
  if ($healthy) {
    try { $siteStatus = Deploy-Site -Root $InstallRoot -Target $SitePath }
    catch { Log "ERR" "The compiled frontend could not be deployed to the web server: $($_.Exception.Message)"; $siteStatus = "failed" }
  }

  Log "INFO" "Install log: $script:LogFile"
  if (-not $appsOnline) { Log "ERR" "The CommandPulse CMMS Windows services are not both running. See the log for the service output."; exit 3 }
  if ($healthy) {
    Remove-InstallStaging -BackendDir $backendDir
    if ($siteStatus -eq "failed") {
      Log "ERR" "The application is running, but the compiled frontend was not deployed to the web server (see above); the site still serves its previous build."
      exit 5
    }
    Log "INFO" "Engine finished (full)"; exit 0
  }
  Log "ERR" "The installation completed but the API is not answering yet."; exit 3
}
catch {
  Log "ERR" $_.Exception.Message
  if ($_.ScriptStackTrace) { Log "ERR" $_.ScriptStackTrace }
  Log "INFO" "Install log: $script:LogFile"
  exit 1
}