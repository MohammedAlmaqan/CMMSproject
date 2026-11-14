#requires -version 5.1
<#
.SYNOPSIS
  Installs, removes and inspects the CommandPulse CMMS Windows services.

.DESCRIPTION
  The API and the scheduler worker run as two native Windows services, not as PM2
  applications and not as a logon task. Each service is a thin WinSW wrapper
  (installer\tools\winsw\WinSW.NET461.exe) around node.exe, so the processes are
  owned by the Service Control Manager:

    * Startup type Automatic, so both start at boot before anyone logs on.
    * Default account LocalSystem (S-1-5-18); a dedicated account can be supplied
      with -ServiceAccount / -ServiceAccountPassword.
    * Working directory is <install>\backend, because the application loads
      backend\.env through Prisma and resolves uploads relative to that folder.
    * Restart on failure (WinSW onfailure plus SCM failure actions).
    * stdout/stderr are captured under backend\logs with size-based rollover.

  The same file also registers the health watchdog task: it polls
  /api/health every five minutes as SYSTEM and restarts the API after three
  consecutive failures. The task is disabled while the installer upgrades the
  files, so it cannot restart a service that is deliberately stopped.

  Invoke it with -Mode (the installer runs it as a child process, so its param()
  block cannot overwrite the installer's own variables). It never touches a
  database.

.PARAMETER Mode
  install  - ensure both services exist, are Automatic and are running.
  remove   - stop and delete both services and the watchdog task.
  status   - print a machine-readable status object and exit.
  render   - write the service XML next to the wrapper and do not install.
  migrate  - stop and remove the legacy PM2 applications, then install.
  stop     - stop both services and wait for them to reach Stopped.
  start    - start both services and wait for them to reach Running.

.PARAMETER BackendDir
  The installed backend folder (the folder holding dist\index.js and .env).

.PARAMETER ApiPort
  Port the API binds. Default 4000.

.PARAMETER BindHost
  Address the API binds. Default 127.0.0.1.

.PARAMETER ServicePrefix
  Optional unique prefix for side-by-side installs. The default service names are
  CommandPulseCMMSAPI and CommandPulseCMMSWorker.

.PARAMETER ServiceAccount
  LocalSystem (default), LocalService, NetworkService, or a domain/local account
  in DOMAIN\user form. Only LocalSystem needs no password.

.PARAMETER ServiceAccountPassword
  SecureString password for a dedicated account. Never logged.

.PARAMETER WinSwSource
  Path to the WinSW executable. Defaults to installer\tools\winsw\WinSW.NET461.exe
  relative to this script.
#>
[CmdletBinding()]
param(
  [ValidateSet("install", "remove", "status", "render", "migrate", "stop", "start")]
  [string]$Mode = "install",
  [string]$BackendDir = "",
  [int]$ApiPort = 4000,
  [string]$BindHost = "127.0.0.1",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$ServicePrefix = "",
  [string]$ServiceAccount = "LocalSystem",
  [System.Security.SecureString]$ServiceAccountPassword,
  [string]$WinSwSource = "",
  [switch]$SkipHealthCheck,
  [switch]$SkipWatchdog,
  [switch]$KeepLegacyPm2,
  [switch]$DependOnPostgres
)

$ErrorActionPreference = "Stop"

# The installer passes the account password through the environment, not on the
# command line, because command lines are visible to other processes.
if (-not $ServiceAccountPassword -and $env:CMMS_SERVICE_ACCOUNT_PASSWORD) {
  $ServiceAccountPassword = ConvertTo-SecureString $env:CMMS_SERVICE_ACCOUNT_PASSWORD -AsPlainText -Force
}

$script:ApiServiceName = ""
$script:WorkerServiceName = ""
$script:WatchdogTaskName = "CommandPulse CMMS Health Watchdog"

function Write-ServiceLog {
  param([string]$Level, [string]$Message)
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1,-5} {2}" -f (Get-Date), $Level, $Message
  Write-Host $line
  if ($script:ServiceLogPath) {
    try { Add-Content -LiteralPath $script:ServiceLogPath -Value $line -Encoding UTF8 } catch { }
  }
}

function Get-CmmsServiceNames {
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

function Get-CmmsNodePath {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  foreach ($candidate in @(
      (Join-Path $env:ProgramFiles "nodejs\node.exe"),
      (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"))) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  throw "node.exe was not found. Install Node.js 24 LTS and re-run."
}

function Get-CmmsPortOwnerPid {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($conn) { return [int]$conn.OwningProcess }
  return 0
}

function Get-CmmsParentProcessId {
  param([int]$ProcessId)
  $proc = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $ProcessId) -ErrorAction SilentlyContinue
  if ($proc) { return [int]$proc.ParentProcessId }
  return 0
}

# True when the process holding the port is the service, or a descendant of it.
# A PostgreSQL service runs pg_ctl.exe, which spawns postgres.exe, so the listener
# is rarely the service PID itself.
function Test-CmmsServiceOwnsProcess {
  param([string]$ServiceName, [int]$OwnerPid)
  if ($OwnerPid -le 0) { return $false }
  $wmi = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $ServiceName) -ErrorAction SilentlyContinue
  if (-not $wmi -or [int]$wmi.ProcessId -le 0) { return $false }
  $servicePid = [int]$wmi.ProcessId
  $cursor = $OwnerPid
  for ($depth = 0; $depth -lt 6 -and $cursor -gt 0; $depth++) {
    if ($cursor -eq $servicePid) { return $true }
    $cursor = Get-CmmsParentProcessId -ProcessId $cursor
  }
  return $false
}

<#
  Returns the name of the PostgreSQL SCM service the API should depend on, or ""
  when no such dependency is safe.

  A dependency is only safe when SCM itself will be able to start the service.
  On 2026-11-03 the naive version returned `postgresql-x64-18` while that service
  was Automatic but Stopped, because a manually started postmaster (pg_ctl) held
  port 5432. SCM then tried to start a second postmaster, PostgreSQL refused
  ("lock file postmaster.pid already exists"), and the API could not start.

  Rules:
    * non-local host  -> no dependency; a remote database is not a local service.
    * service Running -> depend, but only if it actually owns the database port.
    * service Stopped -> depend only when nothing else owns the port, because
      then SCM can start it at boot. If a foreign postmaster owns the port, a
      dependency would fail, so return "" and let the caller run without one.
#>
function Get-CmmsPostgresServiceName {
  param([string]$PgHost, [int]$PgPort = 5432)
  $localNames = @("localhost", "127.0.0.1", ".", "(local)")
  if ($PgHost) {
    $name = $PgHost.Trim().ToLowerInvariant()
    if (($localNames -notcontains $name) -and $name -ne $env:COMPUTERNAME.ToLowerInvariant()) {
      return ""
    }
  }

  $owner = Get-CmmsPortOwnerPid -Port $PgPort
  $candidates = @(Get-Service -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^postgresql' } |
      Sort-Object Name)

  foreach ($svc in $candidates) {
    $wmi = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $svc.Name) -ErrorAction SilentlyContinue
    if (-not $wmi) { continue }
    if ([string]$wmi.StartMode -notmatch '^Auto') { continue }
    if ($svc.Status -eq 'Running') {
      if ($owner -gt 0 -and (Test-CmmsServiceOwnsProcess -ServiceName $svc.Name -OwnerPid $owner)) {
        return $svc.Name
      }
      continue
    }
    if ($owner -eq 0) { return $svc.Name }
  }
  return ""
}

function Escape-Xml {
  param([string]$Text)
  if ($null -eq $Text) { return "" }
  return [System.Security.SecurityElement]::Escape($Text)
}

function Test-BuiltInServiceAccount {
  param([string]$Account)
  if (-not $Account) { return $true }
  $normalized = $Account.Trim().ToLowerInvariant()
  return @(
    "localsystem",
    "nt authority\system",
    "localservice",
    "nt authority\localservice",
    "networkservice",
    "nt authority\networkservice"
  ) -contains $normalized
}

function Assert-Administrator {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Installing a Windows service requires an elevated PowerShell window."
  }
}

function Write-CmmsServiceXml {
  param(
    [string]$Id,
    [string]$DisplayName,
    [string]$Description,
    [string]$NodePath,
    [string]$ScriptPath,
    [string]$WorkingDirectory,
    [string]$LogPath,
    [int]$Port,
    [string]$Bind,
    [string]$DependOn
  )
  $envLines = @(
    '  <env name="NODE_ENV" value="production" />'
  )
  if ($Port -gt 0) { $envLines += ('  <env name="PORT" value="{0}" />' -f $Port) }
  if ($Bind) { $envLines += ('  <env name="BIND_HOST" value="{0}" />' -f (Escape-Xml $Bind)) }

  $dependLine = if ($DependOn) { '  <depend>{0}</depend>' -f (Escape-Xml $DependOn) } else { '' }

  $xml = @"
<service>
  <id>$(Escape-Xml $Id)</id>
  <name>$(Escape-Xml $DisplayName)</name>
  <description>$(Escape-Xml $Description)</description>
  <executable>$(Escape-Xml $NodePath)</executable>
  <arguments>$(Escape-Xml $ScriptPath)</arguments>
  <workingdirectory>$(Escape-Xml $WorkingDirectory)</workingdirectory>
$($envLines -join "`r`n")
  <startmode>Automatic</startmode>
  <delayedAutoStart>false</delayedAutoStart>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>20 sec</stoptimeout>
  <logpath>$(Escape-Xml $LogPath)</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
$dependLine</service>
"@
  return $xml
}

function Get-CmmsServiceDirectory {
  param([string]$Root)
  return (Join-Path $Root "service")
}

function Install-CmmsSingleService {
  param(
    [string]$Id,
    [string]$DisplayName,
    [string]$Description,
    [string]$Backend,
    [string]$NodePath,
    [string]$ServiceExe,
    [string]$ServiceXml,
    [string]$Account,
    [System.Security.SecureString]$AccountPassword,
    [string]$DependOn
  )
  $service = Get-Service -Name $Id -ErrorAction SilentlyContinue
  if ($service) {
    Write-ServiceLog "INFO" "Service '$Id' already exists (state=$($service.Status)); updating its definition"
    if ($service.Status -ne "Stopped") {
      Stop-Service -Name $Id -Force -ErrorAction Stop
      $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
    }
    # `sc config` updates start type, dependencies and account without deleting
    # the service, so an upgrade never has a window in which the service is absent.
    # It does NOT change the binary path. A service registered by an earlier
    # install in a different folder - a hand-run registration from a source tree,
    # or an install that has since moved - would keep running that folder's
    # wrapper, which reads the XML and .env beside itself, so the "upgrade" would
    # report success and go on serving the old tree. Repoint it here, while it is
    # stopped. The value written is the one `sc.exe config <id> binPath=` writes:
    # ImagePath, quoted. It is written directly because sc.exe re-quotes its
    # argument differently under Windows PowerShell and PowerShell 7, and it is
    # read back so a wrong value fails the install instead of starting the wrong
    # program.
    $wrapper = '"{0}"' -f $ServiceExe
    $serviceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$Id"
    $currentPath = [string](Get-ItemProperty -LiteralPath $serviceKey -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
    if ($currentPath.Trim() -ne $wrapper) {
      Write-ServiceLog "INFO" "Service '$Id' ran '$currentPath'; repointing it at '$ServiceExe'"
      Set-ItemProperty -LiteralPath $serviceKey -Name ImagePath -Value $wrapper
      $effective = [string](Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $Id) -ErrorAction SilentlyContinue).PathName
      if ($effective.Trim() -ne $wrapper) {
        throw "Service '$Id' still reports '$effective' after being pointed at '$ServiceExe'"
      }
      Write-ServiceLog "OK" "Service '$Id' now runs '$ServiceExe'"
    }
    $null = & sc.exe config $Id start= auto 2>&1
    if ($LASTEXITCODE -ne 0) { throw "sc.exe config start=auto failed for '$Id' (exit $LASTEXITCODE)" }
    $null = & sc.exe description $Id $Description 2>&1
    if (-not (Test-BuiltInServiceAccount -Account $Account)) {
      if ($AccountPassword) {        $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
          [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AccountPassword))
        try {
          $null = & sc.exe config $Id obj= $Account password= $plain 2>&1
          if ($LASTEXITCODE -ne 0) { throw "sc.exe config obj/password failed for '$Id' (exit $LASTEXITCODE)" }
        } finally { $plain = $null }
      } else {
        Write-ServiceLog "WARN" "Service '$Id' keeps its existing account; no password was supplied"
      }
    }
    # The XML next to the wrapper was already rewritten by the caller, so a later
    # `uninstall`/`install` uses the current values. No file work is needed here.
  } else {
    Write-ServiceLog "INFO" "Installing service '$Id'"
    $result = & $ServiceExe install 2>&1
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed for '$Id' (exit $LASTEXITCODE): $($result -join ' ')" }
    $null = & sc.exe config $Id start= auto 2>&1
    if ($LASTEXITCODE -ne 0) { throw "sc.exe config start=auto failed for '$Id' (exit $LASTEXITCODE)" }
    $null = & sc.exe description $Id $Description 2>&1
    if (-not (Test-BuiltInServiceAccount -Account $Account)) {
      if (-not $AccountPassword) { throw "A password is required to run service '$Id' as '$Account'." }
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AccountPassword))
      try {
        $null = & sc.exe config $Id obj= $Account password= $plain 2>&1
        if ($LASTEXITCODE -ne 0) { throw "sc.exe config obj/password failed for '$Id' (exit $LASTEXITCODE)" }
      } finally { $plain = $null }
    }
  }

  # Dependencies are applied to new and existing services alike, so an upgrade can
  # also *clear* a dependency that is no longer safe (for example if PostgreSQL
  # moved back out from under SCM). The XML `<depend>` element only takes effect
  # on the initial `install`, so `sc config` is the authority here.
  if ($DependOn) {
    $null = & sc.exe config $Id depend= $DependOn 2>&1
    if ($LASTEXITCODE -ne 0) { throw "sc.exe config depend failed for '$Id' (exit $LASTEXITCODE)" }
  } else {
    $null = & sc.exe config $Id depend= "" 2>&1
    if ($LASTEXITCODE -ne 0) { Write-ServiceLog "WARN" "Clearing the dependency list of '$Id' returned $LASTEXITCODE" }
  }

  # Belt and braces: WinSW's <onfailure> handles the wrapper, and SCM failure
  # actions handle the service object itself if the wrapper exits unexpectedly.
  $null = & sc.exe failure $Id reset= 3600 actions= restart/10000/restart/30000/restart/60000 2>&1
  if ($LASTEXITCODE -ne 0) { Write-ServiceLog "WARN" "sc.exe failure returned $LASTEXITCODE for '$Id'" }
}

function Test-CmmsApiHealth {
  param([int]$Port, [int]$Attempts = 30, [int]$DelaySeconds = 2)
  $url = "http://127.0.0.1:$Port/api/health"
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
      if ($resp.StatusCode -eq 200) {
        Write-ServiceLog "OK" "$url returned 200"
        return $true
      }
    } catch { }
    Start-Sleep -Seconds $DelaySeconds
  }
  Write-ServiceLog "ERR" "$url did not answer 200 after $Attempts attempts"
  return $false
}

function Register-CmmsWatchdog {
  param(
    [string]$Root,
    [string]$ServiceName,
    [int]$Port,
    [int]$Threshold = 3
  )
  $serviceDir = Get-CmmsServiceDirectory -Root $Root
  $scriptSource = Join-Path $PSScriptRoot "health-watchdog.ps1"
  if (-not (Test-Path -LiteralPath $scriptSource)) {
    throw "The watchdog script was not found at $scriptSource"
  }
  $scriptTarget = Join-Path $serviceDir "health-watchdog.ps1"
  Copy-Item -LiteralPath $scriptSource -Destination $scriptTarget -Force

  $logDir = Join-Path $Root "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $logPath = Join-Path $logDir "watchdog.log"
  $statePath = Join-Path $logDir "watchdog-state.json"

  $action = New-ScheduledTaskAction -Execute (Join-Path $env:windir "System32\WindowsPowerShell\v1.0\powershell.exe") `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -ServiceName "{1}" -Url "http://127.0.0.1:{2}/api/health" -LogPath "{3}" -StatePath "{4}" -Threshold {5}' -f `
      $scriptTarget, $ServiceName, $Port, $logPath, $statePath, $Threshold)
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)
  $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $description = "Polls $ServiceName /api/health every 5 minutes as SYSTEM and restarts the service after $Threshold consecutive failures."

  Register-ScheduledTask -TaskName $script:WatchdogTaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Description $description -Force | Out-Null
  Write-ServiceLog "OK" "Watchdog task '$($script:WatchdogTaskName)' registered (every 5 minutes, restart after $Threshold failures)"
}

function Suspend-CmmsWatchdog {
  $task = Get-ScheduledTask -TaskName $script:WatchdogTaskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -ne "Disabled") {
    Disable-ScheduledTask -TaskName $script:WatchdogTaskName | Out-Null
    Write-ServiceLog "INFO" "Watchdog task disabled for the upgrade window"
  }
}

function Resume-CmmsWatchdog {
  $task = Get-ScheduledTask -TaskName $script:WatchdogTaskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq "Disabled") {
    Enable-ScheduledTask -TaskName $script:WatchdogTaskName | Out-Null
    Write-ServiceLog "INFO" "Watchdog task re-enabled"
  }
}

function Stop-CmmsLegacyPm2 {
  param([string]$Backend, [string]$Prefix)
  $pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
  if (-not $pm2) { $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue }
  if (-not $pm2) { return }

  $apps = @()
  if ($Prefix) {
    # Must match Get-AppNames in installer\install.ps1, which names the PM2
    # applications "<prefix>api" and "<prefix>worker".
    $apps = @("${Prefix}api", "${Prefix}worker")
  } else {
    $apps = @("cmms-api", "cmms-worker")
  }
  $listed = (& $pm2.Source list 2>&1 | Out-String)
  $found = @()
  foreach ($app in $apps) {
    if ($listed -match [regex]::Escape($app)) { $found += $app }
  }
  if ($found.Count -eq 0) {
    Write-ServiceLog "INFO" "No legacy PM2 applications to remove"
    return
  }
  Write-ServiceLog "INFO" "Removing legacy PM2 applications: $($found -join ', ')"
  # `delete` removes the entry from the process table. It is deliberately paired
  # with `save` (never `stop` + `save`): the service now owns these processes, and
  # a saved stopped entry would resurrect as a duplicate after a reboot.
  & $pm2.Source delete @found 2>&1 | Out-Null
  & $pm2.Source save 2>&1 | Out-Null
}

function Remove-CmmsLegacyResurrectTask {
  $task = Get-ScheduledTask -TaskName "CommandPulse CMMS PM2 Resurrect" -ErrorAction SilentlyContinue
  if ($task) {
    Unregister-ScheduledTask -TaskName "CommandPulse CMMS PM2 Resurrect" -Confirm:$false
    Write-ServiceLog "OK" "Removed the legacy PM2 logon task 'CommandPulse CMMS PM2 Resurrect'"
  }
}

function Install-CmmsServices {
  param(
    [string]$Root,
    [int]$Port = 4000,
    [string]$Bind = "127.0.0.1",
    [string]$DatabaseHost = "localhost",
    [int]$DatabasePort = 5432,
    [string]$Prefix = "",
    [string]$Account = "LocalSystem",
    [System.Security.SecureString]$AccountPassword,
    [string]$WinSw = "",
    [switch]$SkipHealth,
    [switch]$SkipWatchdogTask,
    [switch]$MigratePm2,
    [switch]$KeepPm2,
    [switch]$DependOnPostgres
  )
  Assert-Administrator
  if (-not $Root) { throw "-BackendDir is required." }
  $root = (Resolve-Path -LiteralPath $Root).Path
  if (-not (Test-Path -LiteralPath (Join-Path $root "dist\index.js"))) {
    throw "$root does not look like an installed backend folder (no dist\index.js)."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $root ".env"))) {
    throw "$root has no .env; the service would start without a database connection."
  }

  $names = Get-CmmsServiceNames -Prefix $Prefix
  $script:ApiServiceName = $names.Api
  $script:WorkerServiceName = $names.Worker
  $script:WatchdogTaskName = $names.Watchdog
  $script:ServiceLogPath = Join-Path $root "logs\service-install.log"

  $serviceDir = Get-CmmsServiceDirectory -Root $root
  New-Item -ItemType Directory -Force -Path $serviceDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $root "logs") | Out-Null

  if (-not $WinSw) {
    $WinSw = Join-Path $PSScriptRoot "..\tools\winsw\WinSW.NET461.exe"
  }
  if (-not (Test-Path -LiteralPath $WinSw)) {
    throw "The WinSW service wrapper was not found at $WinSw"
  }
  $nodePath = Get-CmmsNodePath

  # No hard dependency by default. On 2026-11-03 a PostgreSQL crash left a stale
  # postmaster and the next service start spent ~3 minutes in recovery - longer
  # than SCM's start timeout. A hard dependency then stopped the API from starting
  # at all (System log 7001). The API does not need the database to boot (Prisma
  # connects lazily and /api/health is database-free), and the worker is restarted
  # by WinSW until the database arrives, so starting independently is the safer
  # order. -DependOnPostgres opts into SCM ordering for sites whose PostgreSQL
  # service starts reliably.
  $dependOn = ""
  if ($DependOnPostgres) {
    $dependOn = Get-CmmsPostgresServiceName -PgHost $DatabaseHost -PgPort $DatabasePort
    if (-not $dependOn) {
      Write-ServiceLog "WARN" "-DependOnPostgres was requested but no running PostgreSQL service owns port $DatabasePort; starting without a dependency"
    }
  }

  Write-ServiceLog "INFO" "=== Installing CommandPulse CMMS Windows services ==="
  Write-ServiceLog "INFO" "Backend : $root"
  Write-ServiceLog "INFO" "Node    : $nodePath"
  Write-ServiceLog "INFO" "Account : $Account"
  if ($dependOn) { Write-ServiceLog "INFO" "Depends : $dependOn (local PostgreSQL)" }

  Suspend-CmmsWatchdog

  # The wrapper executable cannot be overwritten while a service is running, so
  # stop both before any file is copied. This also makes a re-run idempotent.
  foreach ($id in @($names.Api, $names.Worker)) {
    $running = Get-Service -Name $id -ErrorAction SilentlyContinue
    if ($running -and $running.Status -ne "Stopped") {
      Write-ServiceLog "INFO" "Stopping '$id' before replacing its wrapper"
      Stop-Service -Name $id -Force -ErrorAction Stop
      try { $running.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30)) } catch { }
    }
  }

  if ($MigratePm2 -and -not $KeepPm2) {
    Stop-CmmsLegacyPm2 -Backend $root -Prefix $Prefix
  }

  $definitions = @(
    @{
      Id = $names.Api
      Name = "CommandPulse CMMS API"
      Description = "CommandPulse CMMS HTTP API. Listens on ${Bind}:$Port behind the IIS reverse proxy."
      Script = "dist\index.js"
      Port = $Port
      Bind = $Bind
    },
    @{
      Id = $names.Worker
      Name = "CommandPulse CMMS Worker"
      Description = "CommandPulse CMMS background worker: PM generation, overdue sweep and audit retention."
      Script = "dist\worker.js"
      Port = 0
      Bind = ""
    }
  )

  foreach ($d in $definitions) {
    $exe = Join-Path $serviceDir ("{0}.exe" -f $d.Id)
    $xml = Join-Path $serviceDir ("{0}.xml" -f $d.Id)
    Copy-Item -LiteralPath $WinSw -Destination $exe -Force
    $content = Write-CmmsServiceXml -Id $d.Id -DisplayName $d.Name -Description $d.Description `
      -NodePath $nodePath -ScriptPath $d.Script -WorkingDirectory $root -LogPath (Join-Path $root "logs") `
      -Port $d.Port -Bind $d.Bind -DependOn $dependOn
    [System.IO.File]::WriteAllText($xml, $content, (New-Object System.Text.UTF8Encoding($false)))
    Install-CmmsSingleService -Id $d.Id -DisplayName $d.Name -Description $d.Description -Backend $root `
      -NodePath $nodePath -ServiceExe $exe -ServiceXml $xml -Account $Account -AccountPassword $AccountPassword -DependOn $dependOn
  }

  Write-ServiceLog "INFO" "Starting $($names.Api)"
  Start-Service -Name $names.Api -ErrorAction Stop
  $api = Get-Service -Name $names.Api
  $api.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))

  $healthy = $true
  if (-not $SkipHealth) { $healthy = Test-CmmsApiHealth -Port $Port }

  Write-ServiceLog "INFO" "Starting $($names.Worker)"
  Start-Service -Name $names.Worker -ErrorAction Stop
  $worker = Get-Service -Name $names.Worker
  $worker.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))

  if ($MigratePm2 -and -not $KeepPm2) {
    # The Resurrect task is a single global logon task owned by the default
    # (unprefixed) install. A side-by-side, prefixed install must not remove it:
    # the other install still depends on it until it is migrated too.
    if (-not $Prefix) {
      Remove-CmmsLegacyResurrectTask
    } elseif (Get-ScheduledTask -TaskName "CommandPulse CMMS PM2 Resurrect" -ErrorAction SilentlyContinue) {
      Write-ServiceLog "WARN" "The legacy 'CommandPulse CMMS PM2 Resurrect' task belongs to the default instance and was left in place"
    }
  }

  if (-not $SkipWatchdogTask) {
    Register-CmmsWatchdog -Root $root -ServiceName $names.Api -Port $Port -Threshold 3
  } else {
    Resume-CmmsWatchdog
  }

  $status = Get-CmmsServiceStatus -Prefix $Prefix -Port $Port
  $status | ConvertTo-Json -Depth 6
  if (-not $healthy) { throw "The API service is running but /api/health did not return 200." }
  Write-ServiceLog "OK" "Both services are Automatic and running"
  return $status
}

function Stop-CmmsServices {
  param([string]$Prefix = "")
  $names = Get-CmmsServiceNames -Prefix $Prefix
  foreach ($id in @($names.Worker, $names.Api)) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if (-not $svc) { Write-ServiceLog "WARN" "Service '$id' does not exist"; continue }
    if ($svc.Status -eq "Stopped") { Write-ServiceLog "INFO" "Service '$id' is already stopped"; continue }
    Write-ServiceLog "INFO" "Stopping '$id'"
    Stop-Service -Name $id -Force -ErrorAction Stop
    $svc.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(45))
    Write-ServiceLog "OK" "Service '$id' stopped"
  }
}

function Start-CmmsServices {
  param([string]$Prefix = "", [int]$Port = 4000, [switch]$SkipHealth)
  $names = Get-CmmsServiceNames -Prefix $Prefix
  foreach ($id in @($names.Api, $names.Worker)) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if (-not $svc) { throw "Service '$id' does not exist; run -Mode install first." }
    if ($svc.Status -ne "Running") {
      Write-ServiceLog "INFO" "Starting '$id'"
      Start-Service -Name $id -ErrorAction Stop
      $svc.WaitForStatus("Running", [TimeSpan]::FromSeconds(60))
    }
    Write-ServiceLog "OK" "Service '$id' is running"
  }
  if (-not $SkipHealth) {
    if (-not (Test-CmmsApiHealth -Port $Port)) { throw "The services are running but /api/health did not return 200." }
  }
}

function Remove-CmmsServices {
  param([string]$Prefix = "")
  $names = Get-CmmsServiceNames -Prefix $Prefix
  $script:WatchdogTaskName = $names.Watchdog
  Write-ServiceLog "INFO" "=== Removing CommandPulse CMMS Windows services ==="

  $task = Get-ScheduledTask -TaskName $script:WatchdogTaskName -ErrorAction SilentlyContinue
  if ($task) {
    Unregister-ScheduledTask -TaskName $script:WatchdogTaskName -Confirm:$false
    Write-ServiceLog "OK" "Watchdog task removed"
  }

  foreach ($id in @($names.Api, $names.Worker)) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if (-not $svc) { continue }
    if ($svc.Status -ne "Stopped") {
      Stop-Service -Name $id -Force -ErrorAction SilentlyContinue
      try { $svc.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30)) } catch { }
    }
    $null = & sc.exe delete $id 2>&1
    if ($LASTEXITCODE -eq 0) { Write-ServiceLog "OK" "Service '$id' deleted" }
    else { Write-ServiceLog "WARN" "sc.exe delete returned $LASTEXITCODE for '$id'" }
  }
}

function Get-CmmsServiceStatus {
  param([string]$Prefix = "", [int]$Port = 4000)
  $names = Get-CmmsServiceNames -Prefix $Prefix
  $script:WatchdogTaskName = $names.Watchdog
  $rows = @()
  foreach ($id in @($names.Api, $names.Worker)) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if (-not $svc) {
      $rows += [pscustomobject]@{ Name = $id; Exists = $false; Status = "missing"; StartType = ""; Account = ""; ProcessId = 0 }
      continue
    }
    $wmi = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $id) -ErrorAction SilentlyContinue
    $account = ""
    $procId = 0
    if ($wmi) {
      $account = [string]$wmi.StartName
      $procId = [int]$wmi.ProcessId
    }
    $rows += [pscustomobject]@{
      Name = $id
      Exists = $true
      Status = [string]$svc.Status
      StartType = [string]$svc.StartType
      Account = $account
      ProcessId = $procId
    }
  }
  $health = $null
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 8
    $health = [pscustomobject]@{ StatusCode = $resp.StatusCode; Body = $resp.Content }
  } catch {
    $health = [pscustomobject]@{ StatusCode = 0; Body = $_.Exception.Message }
  }
  # A SYSTEM task with RunLevel Highest is only readable from an elevated process;
  # report that instead of silently claiming the watchdog is missing.
  $watchdog = "unknown"
  try {
    $task = Get-ScheduledTask -TaskName $script:WatchdogTaskName -ErrorAction Stop
    $watchdog = [string]$task.State
  } catch {
    $watchdog = "unknown (read the task from an elevated session)"
  }
  return [pscustomobject]@{
    Services = $rows
    Health = $health
    WatchdogTask = $watchdog
  }
}

# ---------------------------------------------------------------- entry point --

if ($MyInvocation.InvocationName -ne '.') {
  try {
    switch ($Mode) {
      "render" {
        if (-not $BackendDir) { throw "-BackendDir is required for render." }
        $root = (Resolve-Path -LiteralPath $BackendDir).Path
        $names = Get-CmmsServiceNames -Prefix $ServicePrefix
        $serviceDir = Get-CmmsServiceDirectory -Root $root
        New-Item -ItemType Directory -Force -Path $serviceDir | Out-Null
        $nodePath = Get-CmmsNodePath
        $dependOn = ""
        if ($DependOnPostgres) { $dependOn = Get-CmmsPostgresServiceName -PgHost $PgHost -PgPort $PgPort }
        foreach ($pair in @(
            @{ Id = $names.Api; Name = "CommandPulse CMMS API"; Script = "dist\index.js"; Description = "CommandPulse CMMS HTTP API."; Port = $ApiPort; Bind = $BindHost },
            @{ Id = $names.Worker; Name = "CommandPulse CMMS Worker"; Script = "dist\worker.js"; Description = "CommandPulse CMMS background worker."; Port = 0; Bind = "" })) {
          $xml = Write-CmmsServiceXml -Id $pair.Id -DisplayName $pair.Name -Description $pair.Description `
            -NodePath $nodePath -ScriptPath $pair.Script -WorkingDirectory $root -LogPath (Join-Path $root "logs") `
            -Port $pair.Port -Bind $pair.Bind -DependOn $dependOn
          [System.IO.File]::WriteAllText((Join-Path $serviceDir ("{0}.xml" -f $pair.Id)), $xml, (New-Object System.Text.UTF8Encoding($false)))
          Write-Host $xml
        }
      }
      "install" {
        Install-CmmsServices -Root $BackendDir -Port $ApiPort -Bind $BindHost -DatabaseHost $PgHost -DatabasePort $PgPort -Prefix $ServicePrefix `
          -Account $ServiceAccount -AccountPassword $ServiceAccountPassword -WinSw $WinSwSource `
          -SkipHealth:$SkipHealthCheck -SkipWatchdogTask:$SkipWatchdog -MigratePm2 -DependOnPostgres:$DependOnPostgres
      }
      "migrate" {
        Install-CmmsServices -Root $BackendDir -Port $ApiPort -Bind $BindHost -DatabaseHost $PgHost -DatabasePort $PgPort -Prefix $ServicePrefix `
          -Account $ServiceAccount -AccountPassword $ServiceAccountPassword -WinSw $WinSwSource `
          -SkipHealth:$SkipHealthCheck -SkipWatchdogTask:$SkipWatchdog -MigratePm2 -DependOnPostgres:$DependOnPostgres
      }
      "remove" {
        Remove-CmmsServices -Prefix $ServicePrefix
      }
      "stop" {
        Stop-CmmsServices -Prefix $ServicePrefix
      }
      "start" {
        Start-CmmsServices -Prefix $ServicePrefix -Port $ApiPort -SkipHealth:$SkipHealthCheck
      }
      "status" {
        Get-CmmsServiceStatus -Prefix $ServicePrefix -Port $ApiPort | ConvertTo-Json -Depth 6
      }
    }
    exit 0
  } catch {
    Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace }
    exit 1
  }
}
