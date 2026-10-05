<#
.SYNOPSIS
    D-4 drill: prove WAL archiving and point-in-time recovery (PITR) on a local
    secondary path, and measure the Recovery Point Objective.

.DESCRIPTION
    This is the WAL/PITR counterpart to restore-drill.bat. It stands up a
    throwaway PostgreSQL cluster on its own port, applies the D-4 settings from
    ADMIN_GUIDE 7.8 with the archive target pointed at a real local directory,
    loads a pg_dump of the live database, then:

      1. takes a base backup,
      2. commits a marker row that MUST survive recovery,
      3. commits a second marker row that must NOT survive recovery,
      4. restores the base backup into a second throwaway cluster and recovers
         to a recovery_target_time between the two markers,
      5. asserts marker 1 is present, marker 2 is absent, and the application
         row count matches the source.

    RPO is the quantity this measures. Worst-case data loss is bounded by
    archive_timeout (default 300 s), because PostgreSQL forces a segment switch
    that often. That bound is what makes "RPO < 1 hour" true; the drill also
    reports the observed commit-to-archive lag, which should be far smaller.

    It does not touch the live cluster beyond reading it with pg_dump, and it
    never runs against the production database.

.PARAMETER ArchiveDir
    Secondary backup target. The archived segments are written to <ArchiveDir>\wal.
    Any local path works; the value is deployment-configurable, so this is only
    the location used for the rehearsal.

.PARAMETER ScratchRoot
    Working directory for the throwaway clusters, base backup and temp files.
    Everything this script creates lives under here and can be deleted after.

.PARAMETER PgBin
    Directory holding initdb.exe / pg_ctl.exe / psql.exe / pg_basebackup.exe.

.PARAMETER ArchiveTimeoutSeconds
    archive_timeout for the rehearsal cluster. This is the RPO bound.

.EXAMPLE
    $env:PGPASSWORD = '...'
    .\pitr-drill.ps1 -ArchiveDir C:\cmms-wal
#>
[CmdletBinding()]
param(
    [string]$ArchiveDir = 'C:\cmms-wal',
    [string]$ScratchRoot = (Join-Path $env:TEMP 'cmms-pitr'),
    [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
    [int]$SourcePort = 5433,
    [int]$RestorePort = 5434,
    [string]$LiveHost = 'localhost',
    [int]$LivePort = 5432,
    [string]$LiveDb = 'cmms',
    [string]$LiveUser = 'postgres',
    [int]$ArchiveTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'

foreach ($exe in 'initdb', 'pg_ctl', 'psql', 'pg_basebackup', 'pg_dump') {
    if (-not (Test-Path (Join-Path $PgBin "$exe.exe"))) {
        throw "Missing $exe.exe under -PgBin '$PgBin'. Point -PgBin at your PostgreSQL bin directory."
    }
}
if (-not $env:PGPASSWORD) {
    throw 'PGPASSWORD must be set so pg_dump can read the live database read-only.'
}

$src   = Join-Path $ScratchRoot 'src'
$base  = Join-Path $ScratchRoot 'base'
$rst   = Join-Path $ScratchRoot 'restore'
$arch  = Join-Path $ArchiveDir 'wal'
$dump  = Join-Path $ScratchRoot 'live.sql'

New-Item -ItemType Directory -Force -Path $arch, $ScratchRoot | Out-Null

# The archive path is substituted into both GUCs, so normalise it to forward
# slashes: PostgreSQL runs these through cmd, where a backslash-heavy path is
# easy to mangle.
$archPosix = $arch -replace '\\', '/'

function Invoke-Tool {
    param([string]$Exe, [string[]]$ArgList, [int]$Secs)
    $so = Join-Path $ScratchRoot '_o.txt'
    $se = Join-Path $ScratchRoot '_e.txt'
    # Never pipe a server launcher: postgres inherits the pipe handle and the
    # pipeline then never terminates.
    $p = Start-Process -FilePath $Exe -ArgumentList $ArgList -NoNewWindow -PassThru `
         -RedirectStandardOutput $so -RedirectStandardError $se
    if (-not $p.WaitForExit($Secs * 1000)) {
        try { $p.Kill() } catch { }
        throw "TIMEOUT: $Exe $($ArgList -join ' ')"
    }
    # WaitForExit(timeout) alone leaves ExitCode unpopulated on .NET Framework.
    $p.WaitForExit()
    $out = (Get-Content $so -Raw -ErrorAction SilentlyContinue)
    $err = (Get-Content $se -Raw -ErrorAction SilentlyContinue)
    $code = [int]$p.ExitCode
    Remove-Item $so, $se -Force -ErrorAction SilentlyContinue
    [pscustomobject]@{ Code = $code; Out = "$out".Trim(); Err = "$err".Trim() }
}

function Psql {
    param([int]$Port, [string]$Db, [string]$Sql, [int]$Secs = 60)
    # SQL goes through a file: Start-Process -ArgumentList joins array elements
    # with spaces, which would hand psql a truncated statement.
    $sqlFile = Join-Path $ScratchRoot '_q.sql'
    [System.IO.File]::WriteAllText($sqlFile, $Sql)
    $r = Invoke-Tool (Join-Path $PgBin 'psql.exe') `
        @('-U', 'postgres', '-h', 'localhost', '-p', $Port, '-d', $Db, '-t', '-A', '-f', $sqlFile) $Secs
    if ($r.Code -ne 0) { throw "psql failed ($Port/$Db): $($r.Err) <<$Sql>>" }
    $line = ($r.Out -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
    if ($null -eq $line) { throw "psql returned no output ($Port/$Db): <<$Sql>>" }
    $line.Trim()
}

function PsqlRetry {
    param([int]$Port, [string]$Db, [string]$Sql, [int]$Secs, [string]$Label)
    $deadline = (Get-Date).AddSeconds($Secs)
    $last = ''
    do {
        try { return Psql -Port $Port -Db $Db -Sql $Sql -Secs 20 }
        catch { $last = $_.Exception.Message; Start-Sleep -Seconds 2 }
    } while ((Get-Date) -lt $deadline)
    throw "timed out waiting for $Label on $Port/$Db : $last"
}

function Get-SegmentCount { @(Get-ChildItem $arch -Filter '00000001*' -File -ErrorAction SilentlyContinue).Count }

function Wait-Archive {
    param([int]$Before, [string]$Label)
    for ($i = 0; $i -lt 180; $i++) {
        if ((Get-SegmentCount) -gt $Before) { return }
        Start-Sleep -Seconds 1
    }
    throw "archiver produced no new segment for $Label (archive_command failing?)"
}

# ---------- Phase 0: refuse to run on top of anything ----------
# Leftover throwaway clusters are killed by data directory and by port. The
# match is deliberately narrow so a live cluster is never touched.
Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" |
    Where-Object { $_.CommandLine -like "*$($ScratchRoot -replace '\\', '/')*" -or $_.CommandLine -like "*$ScratchRoot*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($p in @($SourcePort, $RestorePort)) {
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 3
foreach ($d in @($src, $rst)) {
    if (Test-Path "$d\postmaster.pid") { Remove-Item -Force "$d\postmaster.pid" }
}
foreach ($p in @($SourcePort, $RestorePort)) {
    if (Test-NetConnection -ComputerName localhost -Port $p -WarningAction SilentlyContinue -InformationLevel Quiet) {
        throw "port $p is still bound; refusing to start"
    }
}
# Start from an empty archive so the evidence is unambiguous about what this
# run produced.
$stale = @(Get-ChildItem $arch -Filter '00000001*' -File -ErrorAction SilentlyContinue)
if ($stale.Count) { $stale | Remove-Item -Force }
Write-Output "PHASE 0 cleared $($stale.Count) stale segment(s) from $arch; ports $SourcePort/$RestorePort free"

# ---------- Phase 1: rehearsal cluster with the ADMIN_GUIDE 7.8 settings ----------
if (Test-Path $src) { Remove-Item -Recurse -Force $src }
$r = Invoke-Tool (Join-Path $PgBin 'initdb.exe') @('-D', $src, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C') 240
if ($r.Code -ne 0) { throw "initdb failed: $($r.Err)" }

$conf = @"
# D-4 drill source cluster. The first block is the ADMIN_GUIDE 7.8 deliverable
# with the site-specific archive target resolved to a real directory.
port = $SourcePort
listen_addresses = 'localhost'
wal_level = replica
archive_mode = on
archive_command = 'copy /Y "%p" "$archPosix/%f"'
archive_timeout = $ArchiveTimeoutSeconds
max_wal_senders = 10
logging_collector = off
log_min_messages = warning
log_line_prefix = '%m [%p] '
# Drill only, not part of the D-4 config: keep background autovacuum out of the
# measured window.
autovacuum = off
"@
# Written without a BOM: a UTF-8 BOM makes postgresql.conf fail to parse.
[System.IO.File]::WriteAllText((Join-Path $src 'postgresql.rehearsal.conf'), $conf)
[System.IO.File]::AppendAllText((Join-Path $src 'postgresql.conf'), "`ninclude 'postgresql.rehearsal.conf'`n")

$r = Invoke-Tool (Join-Path $PgBin 'pg_ctl.exe') @('-D', $src, '-l', (Join-Path $ScratchRoot 'source.log'), '-w', '-t', '60', 'start') 120
if ($r.Code -ne 0) { throw "source cluster start failed (exit $($r.Code)): $($r.Out) / $($r.Err)" }
foreach ($guc in 'archive_mode', 'archive_command', 'archive_timeout', 'wal_level') {
    Write-Output ("  {0,-16} = {1}" -f $guc, (Psql -Port $SourcePort -Db 'postgres' -Sql "select setting from pg_settings where name='$guc'"))
}

# ---------- Phase 2: load the live data ----------
Write-Output 'PHASE 2 load a pg_dump of the live database'
$r = Invoke-Tool (Join-Path $PgBin 'pg_dump.exe') `
    @('-w', '-h', $LiveHost, '-p', $LivePort, '-U', $LiveUser, '-d', $LiveDb, '--no-owner', '--no-privileges', '--file', $dump) 600
if ($r.Code -ne 0) { throw "pg_dump of $LiveDb failed: $($r.Err)" }
Psql -Port $SourcePort -Db 'postgres' -Sql 'create database cmms_pitr' | Out-Null
$r = Invoke-Tool (Join-Path $PgBin 'psql.exe') @('-U', 'postgres', '-h', 'localhost', '-p', $SourcePort, '-d', 'cmms_pitr', '-q', '-v', 'ON_ERROR_STOP=1', '-f', $dump) 900
if ($r.Code -ne 0) { throw "loading the dump failed: $($r.Err)" }
$sourceWorkOrders = Psql -Port $SourcePort -Db 'cmms_pitr' -Sql 'select count(*) from "WorkOrder"'
Write-Output "  work orders loaded = $sourceWorkOrders"

# ---------- Phase 3: marker table and base backup ----------
Write-Output 'PHASE 3 marker table and base backup'
Psql -Port $SourcePort -Db 'cmms_pitr' -Sql 'create table pitr_marker(id serial primary key, note text, committed_at timestamptz default clock_timestamp())' | Out-Null
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
# -X none on purpose. With -X stream the backup's pg_wal holds a TRUNCATED copy
# of the segment the backup started in; recovery prefers that local file, stops
# at the backup end, and silently skips WAL written to that same segment after
# the backup finished. Replaying from the archive is both the fix and what the
# RPO argument actually depends on.
$r = Invoke-Tool (Join-Path $PgBin 'pg_basebackup.exe') `
    @('-h', 'localhost', '-p', $SourcePort, '-U', 'postgres', '-D', $base, '-X', 'none', '-c', 'fast') 600
if ($r.Code -ne 0) { throw "pg_basebackup failed: $($r.Err)" }
Write-Output ("  base backup bytes = " + (Get-ChildItem $base -Recurse -File | Measure-Object Length -Sum).Sum)

# ---------- Phase 4: the marker that must survive ----------
Write-Output 'PHASE 4 commit the marker that recovery must keep'
$before = Get-SegmentCount
$tBefore = Psql -Port $SourcePort -Db 'cmms_pitr' -Sql "insert into pitr_marker(note) values ('BEFORE-must-survive') returning clock_timestamp()::text"
Write-Output "  BEFORE committed at $tBefore"
Psql -Port $SourcePort -Db 'cmms_pitr' -Sql 'select pg_switch_wal()' | Out-Null
Wait-Archive -Before $before -Label 'BEFORE'
$lag = Psql -Port $SourcePort -Db 'postgres' -Sql "select round(extract(epoch from (last_archived_time - '$tBefore'::timestamptz))) from pg_stat_archiver"
Write-Output "  segment archived; observed commit-to-archive lag = ${lag}s"

# ---------- Phase 5: the marker that must NOT survive ----------
Write-Output 'PHASE 5 commit the marker that recovery must exclude'
Start-Sleep -Seconds 20
$beforeCount = Get-SegmentCount
Psql -Port $SourcePort -Db 'cmms_pitr' -Sql "insert into pitr_marker(note) values ('AFTER-must-not-survive')" | Out-Null
# The recovery target is computed by PostgreSQL itself, 5 s before "now": later
# than the BEFORE commit and earlier than the AFTER commit that just happened.
$target = Psql -Port $SourcePort -Db 'postgres' -Sql "select to_char(clock_timestamp() - interval '5 seconds', 'YYYY-MM-DD HH24:MI:SS OF')"
Write-Output "  recovery_target_time = $target"
Psql -Port $SourcePort -Db 'cmms_pitr' -Sql 'select pg_switch_wal()' | Out-Null
Wait-Archive -Before $beforeCount -Label 'AFTER'
Write-Output ("  archiver: " + (Psql -Port $SourcePort -Db 'postgres' -Sql "select 'archived='||coalesce(archived_count,0)||' failed='||coalesce(failed_count,0) from pg_stat_archiver"))

$r = Invoke-Tool (Join-Path $PgBin 'pg_ctl.exe') @('-D', $src, '-m', 'fast', '-w', '-t', '60', 'stop') 120
if ($r.Code -ne 0) { throw "source cluster stop failed (exit $($r.Code)): $($r.Out) / $($r.Err)" }

$present = @(Get-ChildItem $arch -Filter '00000001*' -File -ErrorAction SilentlyContinue)
Write-Output "PHASE 5 archive verified before restore: $($present.Count) segment(s) in $arch"
if ($present.Count -lt 3) { throw "archive holds too few segments to replay ($($present.Count))" }

# ---------- Phase 6: restore and recover to the target ----------
Write-Output 'PHASE 6 restore into a second cluster and recover to the target'
if (Test-Path $rst) { Remove-Item -Recurse -Force $rst }
$r = Invoke-Tool (Join-Path $PgBin 'initdb.exe') @('-D', $rst, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C') 240
if ($r.Code -ne 0) { throw "initdb of restore cluster failed: $($r.Err)" }
# Discard the restore cluster's own initdb WAL: it belongs to a different system
# identifier and must not be a candidate source during archive recovery.
Get-ChildItem (Join-Path $rst 'pg_wal') -File -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item -Path (Join-Path $base '*') -Destination $rst -Recurse -Force

$reconf = @"
# D-4 drill: PITR to a measured point in time
port = $RestorePort
listen_addresses = 'localhost'
# PowerShell Copy-Item rather than cmd's copy: cmd parses the forward slash in
# PostgreSQL's relative %p (pg_wal/RECOVERYXLOG) as an option switch, so the
# copy form restores nothing on Windows.
restore_command = 'powershell.exe -NoProfile -Command Copy-Item -LiteralPath $archPosix/%f -Destination %p -Force'
recovery_target_time = '$target'
recovery_target_inclusive = on
recovery_target_action = 'promote'
"@
[System.IO.File]::WriteAllText((Join-Path $rst 'postgresql.rehearsal.conf'), $reconf)
[System.IO.File]::AppendAllText((Join-Path $rst 'postgresql.conf'), "`ninclude 'postgresql.rehearsal.conf'`n")
# recovery.signal is what makes this archive recovery. Without it the cluster
# only does crash recovery from backup_label, stops at the backup end, and
# ignores restore_command and recovery_target_time entirely.
[System.IO.File]::WriteAllText((Join-Path $rst 'recovery.signal'), '')

$r = Invoke-Tool (Join-Path $PgBin 'pg_ctl.exe') @('-D', $rst, '-l', (Join-Path $ScratchRoot 'restore.log'), '-w', '-t', '180', 'start') 240
if ($r.Code -ne 0) { throw "restore cluster start failed (exit $($r.Code)): $($r.Out) / $($r.Err)" }

PsqlRetry -Port $RestorePort -Db 'postgres' -Sql 'select 1' -Secs 300 -Label 'restore cluster to accept connections' | Out-Null
Write-Output ("  in recovery on arrival = " + (PsqlRetry -Port $RestorePort -Db 'postgres' -Sql 'select pg_is_in_recovery()' -Secs 300 -Label 'recovery state'))
for ($i = 0; $i -lt 180; $i++) {
    if ((Psql -Port $RestorePort -Db 'postgres' -Sql 'select pg_is_in_recovery()') -eq 'f') { break }
    Start-Sleep -Seconds 1
}
$restoredWorkOrders = PsqlRetry -Port $RestorePort -Db 'cmms_pitr' -Sql 'select count(*) from "WorkOrder"' -Secs 120 -Label 'work order count'
$beforeSeen = PsqlRetry -Port $RestorePort -Db 'cmms_pitr' -Sql "select count(*) from pitr_marker where note='BEFORE-must-survive'" -Secs 120 -Label 'BEFORE marker'
$afterSeen  = PsqlRetry -Port $RestorePort -Db 'cmms_pitr' -Sql "select count(*) from pitr_marker where note='AFTER-must-not-survive'" -Secs 120 -Label 'AFTER marker'
Write-Output "  work orders in restored copy = $restoredWorkOrders (source had $sourceWorkOrders)"
Write-Output "  BEFORE marker present = $beforeSeen (expect 1)"
Write-Output "  AFTER marker present  = $afterSeen (expect 0)"

$r = Invoke-Tool (Join-Path $PgBin 'pg_ctl.exe') @('-D', $rst, '-m', 'fast', '-w', '-t', '60', 'stop') 120

Write-Output '--- RESULT ---'
$failed = $false
if ($beforeSeen -ne '1') { Write-Output "FAIL: the marker committed before the recovery target is missing - replay did not reach the target."; $failed = $true }
if ($afterSeen -ne '0') { Write-Output 'FAIL: the marker committed after the recovery target is present - recovery ran past the target.'; $failed = $true }
if ($restoredWorkOrders -ne $sourceWorkOrders) { Write-Output "FAIL: restored work order count $restoredWorkOrders does not match source $sourceWorkOrders."; $failed = $true }
if ($failed) { throw 'PITR drill FAILED' }
Write-Output ("PASS: WAL archived to {0}; PITR stopped at the target." -f $arch)
Write-Output ("      observed commit-to-archive lag = {0}s; archive_timeout = {1}s bounds worst-case loss, so RPO < 1 hour." -f $lag, $ArchiveTimeoutSeconds)
Write-Output "      Note: archive_mode is still off on the live cluster; enabling it there is a deployment step, not part of this drill."