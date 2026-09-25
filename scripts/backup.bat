@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CommandPulse CMMS Database Backup

set "PROJECT_ROOT=%~dp0.."
set "BACKUP_DIR=%PROJECT_ROOT%\backups"
set "PGHOST=localhost"
set "PGPORT=5432"
set "PGDATABASE=cmms"
set "PGUSER=postgres"

if not defined PGPASSWORD (
    echo ERROR: PGPASSWORD must be set in the scheduled task environment.
    exit /b 1
)

set "PG_DUMP=pg_dump.exe"
where pg_dump.exe >nul 2>nul
if not errorlevel 1 goto pg_dump_ready
REM PostgreSQL 18 local client fallback: C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
set "PG_DUMP=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if not exist "%PG_DUMP%" (
    echo ERROR: pg_dump.exe was not found on PATH or at "%PG_DUMP%".
    exit /b 1
)

:pg_dump_ready
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%BACKUP_DIR%" (
    echo ERROR: Could not create backup directory "%BACKUP_DIR%".
    exit /b 1
)

set "TIMESTAMP="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd-HHmm'"`) do if not defined TIMESTAMP set "TIMESTAMP=%%I"
if not defined TIMESTAMP (
    echo ERROR: Could not create the backup timestamp.
    exit /b 1
)

set "BACKUP_FILE=%BACKUP_DIR%\cmms-%TIMESTAMP%.sql"
set "TEMP_FILE=%BACKUP_DIR%\cmms-%TIMESTAMP%.sql.tmp"
echo Creating backup: %BACKUP_FILE%

"%PG_DUMP%" -w -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d "%PGDATABASE%" --no-owner --no-privileges --file="%TEMP_FILE%"
set "DUMP_EXIT=%ERRORLEVEL%"
if not "%DUMP_EXIT%"=="0" (
    del /q "%TEMP_FILE%" >nul 2>nul
    echo ERROR: pg_dump failed with exit code %DUMP_EXIT%.
    exit /b %DUMP_EXIT%
)

set "DUMP_SIZE="
for %%F in ("%TEMP_FILE%") do set "DUMP_SIZE=%%~zF"
if not defined DUMP_SIZE (
    del /q "%TEMP_FILE%" >nul 2>nul
    echo ERROR: pg_dump did not produce a file.
    exit /b 1
)
if "%DUMP_SIZE%"=="0" (
    del /q "%TEMP_FILE%" >nul 2>nul
    echo ERROR: pg_dump produced an empty file.
    exit /b 1
)

move /y "%TEMP_FILE%" "%BACKUP_FILE%" >nul
if errorlevel 1 (
    echo ERROR: Could not finalize backup "%BACKUP_FILE%".
    exit /b 1
)

set "CMMS_BACKUP_DIR=%BACKUP_DIR%"
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $files = @(Get-ChildItem -LiteralPath $env:CMMS_BACKUP_DIR -Filter 'cmms-*.sql' -File | Where-Object { $_.Name -match '^cmms-\d{4}-\d{2}-\d{2}-\d{4}\.sql$' } | Sort-Object Name -Descending); @($files | Select-Object -Skip 14) | Remove-Item -Force -ErrorAction Stop"
if errorlevel 1 (
    echo ERROR: Backup was created, but retention cleanup failed.
    exit /b 1
)

echo Backup completed successfully.
echo File: %BACKUP_FILE%
echo Size: %DUMP_SIZE% bytes
echo Retention: newest 14 dumps
exit /b 0
