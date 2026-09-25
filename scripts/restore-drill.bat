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
echo PASS: dump restored, WorkOrder query succeeded, drill database dropped.
echo Elapsed seconds: %ELAPSED_SECONDS%
exit /b 0

:drill_failed
if "%DRILL_DB_CREATED%"=="1" (
    echo Cleaning up %DRILL_DATABASE% after failure...
    "%PSQL%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS %DRILL_DATABASE% WITH (FORCE);" >nul 2>nul
)
echo FAIL: restore drill did not complete.
exit /b 1
