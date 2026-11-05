@echo off
rem B&Q Listings v3.5.19 - opens the tool in Chrome (or Edge) so it can read the B&Q templates
rem in ..\listings\templates. Keep the folders from the ZIP as they are. It only opens your browser.
setlocal
set "HERE=%~dp0"
set "FILE=%HERE%BQ_Listings_v3.5.19_Windows.html"
set "PROF=%LOCALAPPDATA%\BQListings\browser"
if not exist "%FILE%" echo Cannot find %FILE% & pause & goto :eof
set "B=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%B%" set "B=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%B%" set "B=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%B%" set "B=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%B%" set "B=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%B%" echo Chrome or Edge not found - opening the file normally. & start "" "%FILE%" & goto :eof
set "URL=file:///%FILE:\=/%"
start "" "%B%" --user-data-dir="%PROF%" --allow-file-access-from-files --no-first-run --no-default-browser-check "%URL%"
