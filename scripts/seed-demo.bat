@echo off
REM ============================================
REM CommandPulse CMMS - Reseed Demo Data (DESTRUCTIVE)
REM ============================================
REM Wipes ALL tables (including WorkOrder + Notification) and recreates the
REM reference/master demo dataset. seed.ts only proceeds with SEED_DEMO=1 and
REM a non-production NODE_ENV. For FRESH/demo installs ONLY - never run on a
REM system with live work orders or notifications.
echo.
echo WARNING: this DESTROYS all WorkOrder and Notification data!
echo Run only on a fresh demo install.
pause
cd /d "%~dp0..\backend"
set SEED_DEMO=1
call npx tsx prisma/seed.ts
echo.
echo Seed done.
pause