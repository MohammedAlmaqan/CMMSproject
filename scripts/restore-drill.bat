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
echo RTO start (ms): %CMMS_DRILL_START_MS%

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
REM Attachment snapshot restore assertion (6.2 follow-up; C13)
REM ============================================
REM A successful SQL restore is NOT a successful backup: the dump holds only
REM Attachment.storagePath. This step *restores* the paired -uploads snapshot
REM into a scratch path and reads a file back, so the drill exercises attachment
REM recovery rather than only counting files.
set "CMMS_DRILL_SQL=%BACKUP_FILE%"
set "CMMS_PROJECT_ROOT=%PROJECT_ROOT%"
set "SCRATCH_UPLOADS=%TEMP%\cmms-restore-uploads-%RANDOM%-%RANDOM%"
set "UPLOAD_COUNT_FILE=%TEMP%\cmms-upload-counts-%RANDOM%-%RANDOM%.txt"
REM Counts and the copy result are emitted on ONE space-separated line: with
REM separate lines, a later for/f iteration would assign an empty token and
REM `set "VAR="` undefines the variable, silently losing the value. Written
REM without a scriptblock because `$sb.Invoke()` returns a collection whose
REM .ToString() is the type name, not a count.
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $sql = $env:CMMS_DRILL_SQL; $stem = [System.IO.Path]::GetFileNameWithoutExtension($sql); $snap = Join-Path (Split-Path -Parent $sql) ($stem + '-uploads'); $live = Join-Path $env:CMMS_PROJECT_ROOT 'backend\uploads'; $scratch = $env:SCRATCH_UPLOADS; $snapCount = 0; if (Test-Path -LiteralPath $snap) { $snapCount = @(Get-ChildItem -LiteralPath $snap -Recurse -File).Count }; $liveCount = 0; if (Test-Path -LiteralPath $live) { $liveCount = @(Get-ChildItem -LiteralPath $live -Recurse -File).Count }; $copied = 0; $readback = 'NA'; $bytes = 0; if ($snapCount -gt 0) { New-Item -ItemType Directory -Path $scratch -Force | Out-Null; Copy-Item -Path (Join-Path $snap '*') -Destination $scratch -Recurse -Force; $copied = @(Get-ChildItem -LiteralPath $scratch -Recurse -File).Count; $f = Get-ChildItem -LiteralPath $scratch -Recurse -File | Select-Object -First 1; if ($null -ne $f) { $bytes = ([System.IO.File]::ReadAllBytes($f.FullName)).Length; $readback = 'OK' } }; Write-Output ($snapCount.ToString() + ' ' + $liveCount.ToString() + ' ' + $copied.ToString() + ' ' + $readback.ToString() + ' ' + $bytes.ToString())" > "%UPLOAD_COUNT_FILE%"
if errorlevel 1 (
    del /q "%UPLOAD_COUNT_FILE%" >nul 2>nul
    echo ERROR: Could not measure or restore the attachment snapshot.
    goto drill_failed
)

set "SNAPSHOT_FILE_COUNT="
set "LIVE_FILE_COUNT="
set "RESTORED_FILE_COUNT="
set "READBACK_STATUS="
set "READBACK_BYTES="
for /f "usebackq tokens=1,2,3,4,5" %%A in ("%UPLOAD_COUNT_FILE%") do (
    if not defined SNAPSHOT_FILE_COUNT set "SNAPSHOT_FILE_COUNT=%%A"
    if not defined LIVE_FILE_COUNT set "LIVE_FILE_COUNT=%%B"
    if not defined RESTORED_FILE_COUNT set "RESTORED_FILE_COUNT=%%C"
    if not defined READBACK_STATUS set "READBACK_STATUS=%%D"
    if not defined READBACK_BYTES set "READBACK_BYTES=%%E"
)
del /q "%UPLOAD_COUNT_FILE%" >nul 2>nul
if not defined SNAPSHOT_FILE_COUNT goto drill_failed
if not defined LIVE_FILE_COUNT goto drill_failed

echo Attachment snapshot files: %SNAPSHOT_FILE_COUNT% (live tree: %LIVE_FILE_COUNT%); restored to scratch: %RESTORED_FILE_COUNT% (read-back %READBACK_STATUS%, %READBACK_BYTES% bytes)

REM Only a mismatch is a failure. A dataset that genuinely has no attachments
REM must not fail the drill, otherwise fresh installs report a false red.
if not "%SNAPSHOT_FILE_COUNT%"=="0" goto attachments_restore_check
if not "%LIVE_FILE_COUNT%"=="0" goto attachments_missing
echo No attachments in this dataset - nothing to assert.
goto attachments_ok

:attachments_restore_check
if not "%RESTORED_FILE_COUNT%"=="%SNAPSHOT_FILE_COUNT%" goto attachments_restore_mismatch
if not "%READBACK_STATUS%"=="OK" goto attachments_readback_fail
echo Attachment store restored (%RESTORED_FILE_COUNT% files) and read back OK.
goto attachments_ok

:attachments_restore_mismatch
echo FAIL: restored %RESTORED_FILE_COUNT% file(s) but the paired snapshot holds %SNAPSHOT_FILE_COUNT%.
goto drill_failed

:attachments_readback_fail
echo FAIL: could not read back a restored attachment file.
goto drill_failed

:attachments_missing
echo FAIL: %LIVE_FILE_COUNT% attachment file(s) exist under backend\uploads but the
echo       snapshot paired with this dump is missing or empty. A restore from
echo       this dump alone would leave every attachment 404-ing.
goto drill_failed

:attachments_ok
echo Attachment snapshot verified.
if defined SCRATCH_UPLOADS if exist "%SCRATCH_UPLOADS%" rmdir /s /q "%SCRATCH_UPLOADS%" >nul 2>nul

REM ============================================
REM App layer: stop backend, rebuild, restart, health-check (C13)
REM ============================================
REM The application tier is recovered by rebuilding the backend and frontend,
REM bringing the API back up, and proving it answers /api/health. This is a real
REM recovery step, not a timer around an empty block.
set "CMMS_APP_START_MS="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()"`) do if not defined CMMS_APP_START_MS set "CMMS_APP_START_MS=%%I"
if not defined CMMS_APP_START_MS (
    echo ERROR: Could not start app-layer timing.
    goto drill_failed
)

echo Stopping the backend on :4000 (if running)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":4000 .*LISTENING"') do (
    echo   taskkill /PID %%a
    taskkill /PID %%a /F >nul 2>nul
)
REM `timeout` fails when stdin is redirected; ping is a TTY-free 2s delay
ping -n 3 127.0.0.1 >nul

echo Rebuilding backend...
pushd "%PROJECT_ROOT%\backend"
call npm run build
if errorlevel 1 (
    echo ERROR: backend rebuild failed.
    popd
    goto drill_failed
)
popd

echo Rebuilding frontend...
pushd "%PROJECT_ROOT%\app"
call npm run build
if errorlevel 1 (
    echo ERROR: frontend rebuild failed.
    popd
    goto drill_failed
)
popd

echo Restarting the backend...
REM Redirect the child's stdio to files so it detaches from the console: a node
REM process inheriting the console would otherwise keep any caller's pipe open.
set "API_OUT_LOG=%TEMP%\cmms-api-restart.out.log"
set "API_ERR_LOG=%TEMP%\cmms-api-restart.err.log"
powershell.exe -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'dist/index.js' -WorkingDirectory (Join-Path $env:CMMS_PROJECT_ROOT 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:TEMP 'cmms-api-restart.out.log') -RedirectStandardError (Join-Path $env:TEMP 'cmms-api-restart.err.log')"

set "HEALTH_FILE=%TEMP%\cmms-health-%RANDOM%-%RANDOM%.txt"
REM Poll 127.0.0.1 explicitly: netstat shows the API on 0.0.0.0 (IPv4 only), so
REM `localhost` can resolve to ::1 and never reach the listener.
powershell.exe -NoProfile -Command "$ok = 'TIMEOUT'; for ($i = 0; $i -lt 90; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4000/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = 'OK'; break } } catch {}; Start-Sleep -Seconds 1 }; Write-Output $ok" > "%HEALTH_FILE%"
set "HEALTH_STATUS="
for /f "usebackq delims=" %%H in ("%HEALTH_FILE%") do if not defined HEALTH_STATUS set "HEALTH_STATUS=%%H"
del /q "%HEALTH_FILE%" >nul 2>nul
if not "%HEALTH_STATUS%"=="OK" goto health_failed
echo Backend is serving /api/health 200.
goto health_ok

:health_failed
echo ERROR: backend did not answer /api/health within 90 s - status %HEALTH_STATUS%
if exist "%API_ERR_LOG%" (
    echo --- node stderr tail ---
    powershell.exe -NoProfile -Command "Get-Content $env:TEMP'\cmms-api-restart.err.log' -Tail 20"
)
if exist "%API_OUT_LOG%" (
    echo --- node stdout tail ---
    powershell.exe -NoProfile -Command "Get-Content $env:TEMP'\cmms-api-restart.out.log' -Tail 20"
)
goto drill_failed

:health_ok

set "CMMS_APP_END_MS="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()"`) do if not defined CMMS_APP_END_MS set "CMMS_APP_END_MS=%%I"

set "APP_ELAPSED_MS="
for /f "usebackq delims=" %%E in (`powershell.exe -NoProfile -Command "$elapsed = [math]::Round(([long]$env:CMMS_APP_END_MS - [long]$env:CMMS_APP_START_MS)/1000.0, 2); $elapsed.ToString([System.Globalization.CultureInfo]::InvariantCulture)"`) do if not defined APP_ELAPSED_MS set "APP_ELAPSED_MS=%%E"

if not defined APP_ELAPSED_MS set "APP_ELAPSED_MS=0.00"

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
echo PASS: dump restored, WorkOrder query succeeded, attachment store restored and read back, backend rebuilt and serving /api/health, drill database dropped.
echo Elapsed seconds: %ELAPSED_SECONDS%
echo RTO (DB restore + attachment restore + app rebuild/restart): %ELAPSED_SECONDS% s (app layer %APP_ELAPSED_MS% s)
exit /b 0

:drill_failed
if "%DRILL_DB_CREATED%"=="1" (
    echo Cleaning up %DRILL_DATABASE% after failure...
    "%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS %DRILL_DATABASE% WITH (FORCE);" >nul 2>nul
)
echo FAIL: restore drill did not complete.
exit /b 1
