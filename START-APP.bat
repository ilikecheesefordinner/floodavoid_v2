@echo off
cd /d "%~dp0"
title ATLANTIS AI Server (Port 8080)
echo ================================================================
echo   Starting ATLANTIS AI Server on http://localhost:8080 ...
echo ================================================================
taskkill /F /IM node.exe >nul 2>&1
start "" "http://localhost:8080"
node server.js
pause
