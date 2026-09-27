@echo off
REM دبل كليك = نشر تلقائي على Vercel
cd /d "%~dp0"
set "NODE_OPTIONS=--require %~dp0shim-hostname.js"
call vercel deploy --prod --yes
echo.
echo ============================================
echo   الرابط: https://ibn-kathir-halaqa.vercel.app
echo ============================================
pause
