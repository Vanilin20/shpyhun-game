@echo off
chcp 65001 >nul
title Шпигун
where node >nul 2>nul || (echo Потрібен Node.js: https://nodejs.org & pause & exit /b)
node "%~dp0server.js"
pause
