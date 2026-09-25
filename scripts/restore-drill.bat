@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CommandPulse CMMS Restore Drill

set "PROJECT_ROOT=%~dp0.."
set "BACKUP_DIR=%PROJECT_ROOT%\backups"
set "PGHOST=localhost"
set "PGPORT=5432"
set "PGDATABASE=cmms"
set "PGUSER=postgres"
set "DRILL_DATABASE=cmms_restore_test"

if not defined PGPASSWORD (
    echo ERROR: PGPASSWORD must be set in the operator environment.
    exit /b 1
)

set "PSQL=psql.exe"
where psql.exe >nul 2>nul
if not errorlevel 1 goto psql_ready
REM PostgreSQL 18 local client fallback: C:\Program Files\PostgreSQL\18\bin\psql.exe
set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
if not exist "%PSQL%" (
    echo ERROR: psql.exe was not found on PATH or at "%PSQL%".
    exit /b 1
)

:psql_ready
echo Target database: %DRILL_DATABASE%
echo Cleaning any previous drill database...
"%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS %DRILL_DATABASE% WITH (FORCE);"
if errorlevel 1 (
    echo ERROR: Could not remove the previous drill database.
    exit /b 1
)

set "CMMS_BACKUP_DIR=%BACKUP_DIR%"
set "BACKUP_FILE="
for /f "usebackq delims=" %%F in (`powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $file = Get-ChildItem -LiteralPath $env:CMMS_BACKUP_DIR -Filter 'cmms-*.sql' -File | Where-Object { $_.Name -match '^cmms-\d{4}-\d{2}-\d{2}-\d{4}\.sql$' } | Sort-Object Name -Descending | Select-Object -First 1; if ($null -ne $file) { $file.FullName }"`) do if not defined BACKUP_FILE set "BACKUP_FILE=%%F"
if not defined BACKUP_FILE (
    echo ERROR: No timestamped cmms-*.sql backup was found in "%BACKUP_DIR%".
    exit /b 1
)

echo Backup: %BACKUP_FILE%

set "CMMS_DRILL_START_MS="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()"`) do if not defined CMMS_DRILL_START_MS set "CMMS_DRILL_START_MS=%%I"
if not defined CMMS_DRILL_START_MS (
    echo ERROR: Could not start restore timing.
    exit /b 1
)

set "DRILL_DB_CREATED=1"
"%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE %DRILL_DATABASE%;"
if errorlevel 1 (
    echo ERROR: Could not create %DRILL_DATABASE%.
    goto drill_failed
)

echo Restoring plain SQL dump...
"%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d "%DRILL_DATABASE%" -v ON_ERROR_STOP=1 --quiet --file="%BACKUP_FILE%"
if errorlevel 1 goto drill_failed

echo WorkOrder count query:
"%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d "%DRILL_DATABASE%" -v ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT count(*) FROM ""WorkOrder"";"
if errorlevel 1 goto drill_failed

REM ============================================
REM Attachment snapshot assertion (6.2 follow-up)
REM ============================================
REM A successful SQL restore is NOT a successful backup: the dump holds only
REM Attachment.storagePath. This asserts the paired -uploads snapshot exists and
REM carries files whenever the live tree has any, so a "green" drill can no
REM longer hide missing attachment bytes.
set "CMMS_DRILL_SQL=%BACKUP_FILE%"
set "CMMS_PROJECT_ROOT=%PROJECT_ROOT%"
set "UPLOAD_COUNT_FILE=%TEMP%\cmms-upload-counts-%RANDOM%-%RANDOM%.txt"
REM Both counts are emitted on ONE space-separated line: with two lines, the second
REM for/f iteration would assign an empty token and `set "VAR="` undefines the
REM variable, silently losing the live count. Written without a scriptblock because
REM `$sb.Invoke()` returns a collection whose .ToString() is the type name, not a count.
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $sql = $env:CMMS_DRILL_SQL; $stem = [System.IO.Path]::GetFileNameWithoutExtension($sql); $snap = Join-Path (Split-Path -Parent $sql) ($stem + '-uploads'); $live = Join-Path $env:CMMS_PROJECT_ROOT 'backend\uploads'; $snapCount = 0; if (Test-Path -LiteralPath $snap) { $snapCount = @(Get-ChildItem -LiteralPath $snap -Recurse -File).Count }; $liveCount = 0; if (Test-Path -LiteralPath $live) { $liveCount = @(Get-ChildItem -LiteralPath $live -Recurse -File).Count }; Write-Output ($snapCount.ToString() + ' ' + $liveCount.ToString())" > "%UPLOAD_COUNT_FILE%"
if errorlevel 1 (
    del /q "%UPLOAD_COUNT_FILE%" >nul 2>nul
    echo ERROR: Could not measure the attachment snapshot.
    goto drill_failed
)

set "SNAPSHOT_FILE_COUNT="
set "LIVE_FILE_COUNT="
for /f "usebackq tokens=1,2" %%A in ("%UPLOAD_COUNT_FILE%") do (
    if not defined SNAPSHOT_FILE_COUNT set "SNAPSHOT_FILE_COUNT=%%A"
    if not defined LIVE_FILE_COUNT set "LIVE_FILE_COUNT=%%B"
)
del /q "%UPLOAD_COUNT_FILE%" >nul 2>nul
if not defined SNAPSHOT_FILE_COUNT goto drill_failed
if not defined LIVE_FILE_COUNT goto drill_failed

echo Attachment snapshot files: %SNAPSHOT_FILE_COUNT% (live tree: %LIVE_FILE_COUNT%)

REM Only a mismatch is a failure. A dataset that genuinely has no attachments
REM must not fail the drill, otherwise fresh installs report a false red.
if not "%SNAPSHOT_FILE_COUNT%"=="0" goto attachments_ok
if not "%LIVE_FILE_COUNT%"=="0" goto attachments_missing
echo No attachments in this dataset - nothing to assert.
goto attachments_ok

:attachments_missing
echo FAIL: %LIVE_FILE_COUNT% attachment file(s) exist under backend\uploads but the
echo       snapshot paired with this dump is missing or empty. A restore from
echo       this dump alone would leave every attachment 404-ing.
goto drill_failed

:attachments_ok
echo Attachment snapshot verified.


set "ELAPSED_SECONDS="
for /f "usebackq delims=" %%E in (`powershell.exe -NoProfile -Command "$elapsed = [math]::Round(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$env:CMMS_DRILL_START_MS) / 1000, 2); $elapsed.ToString([System.Globalization.CultureInfo]::InvariantCulture)"`) do if not defined ELAPSED_SECONDS set "ELAPSED_SECONDS=%%E"
if not defined ELAPSED_SECONDS (
    echo ERROR: Could not calculate restore time.
    goto drill_failed
)

echo Dropping %DRILL_DATABASE%...
"%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS %DRILL_DATABASE% WITH (FORCE);"
if errorlevel 1 goto drill_failed

set "DRILL_DB_COUNT="
set "DB_COUNT_FILE=%TEMP%\cmms-restore-drill-%RANDOM%-%RANDOM%.txt"
"%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT count(*) FROM pg_database WHERE datname = '%DRILL_DATABASE%';" > "%DB_COUNT_FILE%"
if errorlevel 1 (
    del /q "%DB_COUNT_FILE%" >nul 2>nul
    goto drill_failed
)
for /f "usebackq delims=" %%D in ("%DB_COUNT_FILE%") do if not defined DRILL_DB_COUNT set "DRILL_DB_COUNT=%%D"
del /q "%DB_COUNT_FILE%" >nul 2>nul
if not defined DRILL_DB_COUNT goto drill_failed
if not "%DRILL_DB_COUNT%"=="0" goto drill_failed

set "DRILL_DB_CREATED=0"
echo PASS: dump restored, WorkOrder query succeeded, attachment snapshot verified, drill database dropped.
echo Elapsed seconds: %ELAPSED_SECONDS%
exit /b 0

:drill_failed
if "%DRILL_DB_CREATED%"=="1" (
    echo Cleaning up %DRILL_DATABASE% after failure...
    "%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS %DRILL_DATABASE% WITH (FORCE);" >nul 2>nul
)
echo FAIL: restore drill did not complete.
exit /b 1
