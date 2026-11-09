@echo off
cd /d "%~dp0"
echo Starting ATLANTIS AI...
start "" "http://localhost:8080"
node "%~dp0server.js"
pause
