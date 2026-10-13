@echo off
cd /d "%~dp0"
if not exist "team-source\node_modules\vite\bin\vite.js" (
  call npm run setup:client
  if errorlevel 1 exit /b 1
)
call npm run dev
pause
