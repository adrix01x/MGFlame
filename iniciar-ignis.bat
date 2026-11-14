@echo off
rem Abre IGNIS en el navegador con un servidor local (Python 3).
cd /d "%~dp0"
start "" "http://127.0.0.1:4181/"
where py >nul 2>nul && (py -m http.server 4181 --bind 127.0.0.1 --directory dist) || (python -m http.server 4181 --bind 127.0.0.1 --directory dist)
