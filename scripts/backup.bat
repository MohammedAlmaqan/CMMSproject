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

REM ============================================
REM Attachment files (6.2 follow-up)
REM ============================================
REM pg_dump captures only Attachment.storagePath - a relative pointer. The bytes
REM live under backend\uploads\<EntityType>\<entityId>\ and would NOT survive a
REM restore, so they are snapshotted beside the dump under a derivable name:
REM cmms-<timestamp>-uploads\ pairs with cmms-<timestamp>.sql.
REM Gotos are used instead of if/else blocks because this script runs with
REM DisableDelayedExpansion, where %VAR% inside a block would expand at parse time.
set "UPLOADS_SRC=%PROJECT_ROOT%\backend\uploads"
set "UPLOADS_DEST=%BACKUP_DIR%\cmms-%TIMESTAMP%-uploads"
set "UPLOADS_STATE=ABSENT"

if not exist "%UPLOADS_SRC%" goto uploads_absent
if exist "%UPLOADS_DEST%" rd /s /q "%UPLOADS_DEST%" >nul 2>nul
xcopy "%UPLOADS_SRC%" "%UPLOADS_DEST%" /I /E /Y /Q >nul
REM Measured on this host: xcopy returns 0 for a successful copy (whether or not
REM any file was transferred) and 4 for "File not found" / init failure. The
REM documented 1 = "files copied" code is NOT emitted here, so the OK/EMPTY
REM distinction is made by counting the snapshot rather than by exit code.
set "XCOPY_EXIT=%ERRORLEVEL%"
if not "%XCOPY_EXIT%"=="0" goto uploads_failed

set "CMMS_UPLOADS_DEST=%UPLOADS_DEST%"
set "UPLOADS_FILE_COUNT_RAW="
for /f "usebackq delims=" %%C in (`powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; if (Test-Path -LiteralPath $env:CMMS_UPLOADS_DEST) { @(Get-ChildItem -LiteralPath $env:CMMS_UPLOADS_DEST -Recurse -File).Count } else { 0 }"`) do if not defined UPLOADS_FILE_COUNT_RAW set "UPLOADS_FILE_COUNT_RAW=%%C"
set "UPLOADS_FILE_COUNT=%UPLOADS_FILE_COUNT_RAW%"
if not defined UPLOADS_FILE_COUNT set "UPLOADS_FILE_COUNT=0"
if "%UPLOADS_FILE_COUNT%"=="0" goto uploads_empty
set "UPLOADS_STATE=OK, %UPLOADS_FILE_COUNT% file(s)"
echo Attachment snapshot: %UPLOADS_DEST% (%UPLOADS_FILE_COUNT% file(s))
goto uploads_prune

:uploads_failed
echo ERROR: xcopy of "%UPLOADS_SRC%" failed with exit code %XCOPY_EXIT%.
echo        The SQL dump exists, but its attachment snapshot is incomplete.
exit /b %XCOPY_EXIT%

:uploads_absent
echo No "%UPLOADS_SRC%" yet - no attachments have ever been uploaded, skipping snapshot.
goto uploads_prune

:uploads_empty
set "UPLOADS_STATE=EMPTY, 0 file(s)"
echo Attachment snapshot created but the source tree held no files.
goto uploads_prune

:uploads_prune
set "CMMS_BACKUP_DIR=%BACKUP_DIR%"
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $dirs = @(Get-ChildItem -LiteralPath $env:CMMS_BACKUP_DIR -Directory | Where-Object { $_.Name -match '^cmms-\d{4}-\d{2}-\d{2}-\d{4}-uploads$' } | Sort-Object Name -Descending); @($dirs | Select-Object -Skip 14) | Remove-Item -Recurse -Force -ErrorAction Stop"
if errorlevel 1 (
    echo ERROR: Backup was created, but attachment retention cleanup failed.
    exit /b 1
)

echo Backup completed successfully.
echo File: %BACKUP_FILE%
echo Size: %DUMP_SIZE% bytes
echo Attachments: %UPLOADS_STATE%
echo Retention: newest 14 dumps + newest 14 attachment snapshots
exit /b 0
