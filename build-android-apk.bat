@echo off
cd /d "%~dp0"
echo ==================================================================
echo   ATLANTIS AI - ANDROID APK COMPILER
echo ==================================================================
node build-apk.js
echo.
pause
