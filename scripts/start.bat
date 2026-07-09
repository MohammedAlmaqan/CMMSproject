@echo off
REM ============================================
REM CommandPulse CMMS - Start Script for Windows
REM ============================================
title CommandPulse CMMS

echo Starting CommandPulse CMMS...
echo.

REM Start Backend API
echo [1/2] Starting Backend API on port 4000...
cd /d "%~dp0..\backend"

REM If PM2 is installed, use it
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    pm2 start ecosystem.config.cjs
    echo Backend started with PM2
) else (
    echo PM2 not found, starting with Node directly...
    start "CMMS-API" cmd /c "node dist/index.js"
)

REM Start Frontend Dev Server (for development)
echo [2/2] Starting Frontend on port 3000...
cd /d "%~dp0..\app"
start "CMMS-Frontend" cmd /c "npm run dev"

echo.
echo ============================================
echo CMMS is starting up:
echo   Frontend: http://localhost:3000
echo   API:      http://localhost:4000
echo   API Docs: http://localhost:4000/api-docs
echo ============================================
echo.
echo Login credentials:
echo   Username: admin / planner / supervisor / tech1 / tech2 / operator / auditor
echo   Password: password
echo.
pause
