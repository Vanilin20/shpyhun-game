@echo off
chcp 65001 >nul
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b)
netsh advfirewall firewall delete rule name="Spy game" >nul 2>&1
netsh advfirewall firewall add rule name="Spy game" dir=in action=allow protocol=TCP localport=3000 profile=any >nul
if errorlevel 1 (echo Не вдалося додати правило. & pause & exit /b)
echo.
echo  Готово! Телефони тепер можуть під'єднатися до гри (порт 3000).
echo.
pause
