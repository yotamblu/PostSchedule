@echo off
title PostSchedule Setup
echo.
echo  PostSchedule Setup
echo  ------------------
echo.

:: Run the PowerShell setup script in this directory
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

echo.
pause
