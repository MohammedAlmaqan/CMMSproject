@echo off
REM ============================================
REM CommandPulse CMMS - Build Script for Windows
REM ============================================
echo Building CommandPulse CMMS...
echo.

REM Build Backend
echo [1/3] Building Backend...
cd /d "%~dp0..\backend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for backend
    exit /b %errorlevel%
)

REM Stop the dev backend if it holds :4000 — prisma generate must rename
REM query_engine DLLs and EPERMs while a tsx/node process has them loaded.
REM Narrow choice: kill only the PID listening on :4000 (dev API), so we do
REM not nuke unrelated node processes (e.g. the frontend dev server / IDE).
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":4000 .*LISTENING"') do (
    echo Stopping backend on :4000 PID %%a so prisma generate can write DLLs
    taskkill /PID %%a /F 2>nul
)
REM `timeout` fails when stdin is redirected; ping is a TTY-free 2s delay
ping -n 3 127.0.0.1 >nul

call npx prisma generate
REM DB is migration-managed (Phase 4.1); db push is retired
call npx prisma migrate deploy
call npx tsc
if %errorlevel% neq 0 (
    echo ERROR: TypeScript build failed for backend
    exit /b %errorlevel%
)
echo Backend build complete.
echo.

REM Build Frontend
echo [2/3] Building Frontend...
cd /d "%~dp0..\app"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for frontend
    exit /b %errorlevel%
)

call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed
    exit /b %errorlevel%
)
echo Frontend build complete.
echo.

REM [3/3] removed — demo seeding is no longer part of a build.
REM Choice (documented): the old `npx tsx prisma/seed.ts` step wiped ALL tables
REM (WorkOrder + Notification included) without recreating them — a production
REM trust-property violation. seed.ts is now guarded (SEED_DEMO=1 + a
REM non-production NODE_ENV) and demo reseed moved to scripts\seed-demo.bat.
REM Run that ONLY on a fresh demo install; builds never touch live data.
echo Seed skipped - a build must not destroy live WO/Notification data.
echo To reseed demo data on a fresh install only: scripts\seed-demo.bat

echo ============================================
echo Build Complete!
echo.
echo To start the application:
echo   1. Start the API:   cd backend ^&^& npm start
echo   2. Serve frontend from: app/dist/
echo ============================================
pause
