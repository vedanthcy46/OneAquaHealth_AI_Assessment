@echo off
setlocal enabledelayedexpansion

echo =========================================
echo    🌊 Starting AquaGuard AI Stack
echo =========================================
echo.

:: 1. Check if Cloud Database / Redis are configured or Docker should be used
set USE_DOCKER=0
findstr /i /c:"localhost" backend\.env >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set USE_DOCKER=1
)

if %USE_DOCKER% equ 1 (
    echo [1] Local environment detected in .env. Checking Docker...
    docker info >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo [2] Starting local PostgreSQL and Redis containers...
        cd backend
        call docker-compose up -d
        cd ..
    ) else (
        echo [!] Docker is not running. If you are using Cloud DB (Neon) and Cloud Redis (Upstash),
        echo     you can ignore this. Otherwise, start Docker Desktop.
    )
) else (
    echo [1] Cloud database (Neon) and Redis (Upstash) detected in .env!
    echo     Skipping Docker requirement...
)

:: 2. Setup Python AI Service (optional/fallback)
echo.
echo [2] Checking Python AI Service environment...
if not exist "ai\.venv" (
    echo     Creating Python virtual environment...
    python -m venv ai\.venv 2>nul
)
if exist "ai\.venv\Scripts\pip.exe" (
    call ai\.venv\Scripts\pip.exe install -r ai\requirements.txt -q 2>nul
    echo     Python AI dependencies ready.
) else (
    echo     Python not found or skipped. Built-in CV heuristics will run.
)

:: 3. Run Database Migrations and Seed
echo.
echo [3] Verifying Database Schema and Seeds...
cd backend
call npm run migrate
call npm run seed

:: 4. Start Services in new windows
echo.
echo [4] Starting Backend API and Workers...
start "AquaGuard Backend API" cmd /k "npm run dev"
start "AquaGuard AI Worker" cmd /k "npx ts-node src/workers/ai.worker.ts"
cd ..

echo.
echo [5] Starting Frontend...
cd frontend
if not exist "node_modules" (
    echo     Installing frontend dependencies...
    call npm install
)
start "AquaGuard Frontend" cmd /k "npm run dev"
cd ..

echo.
echo =========================================
echo    ✨ AquaGuard AI Stack is RUNNING!
echo.
echo    🌐 Frontend: http://localhost:5173
echo    📖 API Docs: http://localhost:3001/docs
echo    ❤️  Health:   http://localhost:3001/health
echo =========================================
echo.
pause
