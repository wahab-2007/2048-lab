@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 goto use_python
py -3 --version >nul 2>&1
if errorlevel 1 goto use_python
set "CESIUM_PYTHON=py -3"
goto serve

:use_python
where python >nul 2>&1
if errorlevel 1 goto no_python
python -c "import sys; sys.exit(sys.version_info.major != 3)" >nul 2>&1
if errorlevel 1 goto no_python
set "CESIUM_PYTHON=python"
goto serve

:no_python
echo Python 3 was not found. Opening the offline game directly.
start "" "%~dp0index.html"
exit /b

:serve
echo Keep this window open while playing CESIUM. Press Ctrl+C to stop.
%CESIUM_PYTHON% -c "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; from threading import Timer; import webbrowser; server = ThreadingHTTPServer(('127.0.0.1', 8765), SimpleHTTPRequestHandler); Timer(0.35, webbrowser.open, args=['http://127.0.0.1:8765/']).start(); server.serve_forever()"
if errorlevel 1 pause
