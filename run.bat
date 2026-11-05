@echo off
title DecisionPilot AI - Dev Server
cd /d "%~dp0"
echo ===================================================
echo   DecisionPilot AI - Starting Local Services
echo   Backend:  http://127.0.0.1:8000
echo   API Docs: http://127.0.0.1:8000/api/docs
echo   Frontend: http://127.0.0.1:5173
echo ===================================================
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
pause

