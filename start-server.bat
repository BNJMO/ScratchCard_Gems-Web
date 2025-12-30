@echo off
echo.
echo ========================================
echo   Mines Game - Starting Server
echo ========================================
echo.

set NODE_OK=0

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 set NODE_OK=1

if %NODE_OK% EQU 0 (
    echo [INFO] Node.js not detected. Attempting installation...
    where winget >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [INFO] Installing Node.js LTS with winget...
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    ) else (
        if exist "%ProgramData%\chocolatey\bin\choco.exe" (
            echo [INFO] Installing Node.js LTS with Chocolatey...
            choco install -y nodejs-lts
        ) else (
            echo [ERROR] Neither winget nor Chocolatey is available to install Node.js.
            echo Please install Node.js manually from: https://nodejs.org/
            echo.
            pause
            exit /b 1
        )
    )

    where node >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set NODE_OK=1
    ) else (
        echo [ERROR] Node.js installation failed. Please install manually from: https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    echo.
    call npm install
    echo.
)

REM Start the development server
echo [INFO] Starting Vite development server...
echo.
echo The game will open automatically in your browser.
echo If not, navigate to: http://^<your-ip^>:3000
echo.
echo Press Ctrl+C to stop the server.
echo.

call npm run dev -- --host 0.0.0.0 --port 3000

pause
