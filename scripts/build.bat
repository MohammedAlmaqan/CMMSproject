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

call npx prisma generate
call npx prisma db push
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

REM Seed Database
echo [3/3] Seeding Database...
cd /d "%~dp0..\backend"
call npx tsx prisma/seed.ts
if %errorlevel% neq 0 (
    echo WARNING: Database seed completed with warnings
)
echo.

echo ============================================
echo Build Complete!
echo.
echo To start the application:
echo   1. Start the API:   cd backend ^&^& npm start
echo   2. Serve frontend from: app/dist/
echo ============================================
pause
