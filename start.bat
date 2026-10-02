@echo off
setlocal

echo Starting AquaGuard AI Stack...

echo [1] Checking Docker...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Docker is not running. Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo [2] Starting Database and Redis...
cd backend
call docker-compose up -d
cd ..

echo [3] Setting up Python AI Service...
if not exist "ai\.venv" (
    echo Creating virtual environment...
    python -m venv ai\.venv
)
call ai\.venv\Scripts\pip.exe install -r ai\requirements.txt -q

echo [4] Running Database Migrations and Seed...
cd backend
call npm run migrate
call npm run seed

echo [5] Starting Services in new windows...
start "Backend API" cmd /k "npm run dev"
start "AI Worker" cmd /k "npx ts-node src/workers/ai.worker.ts"
cd ..

cd frontend
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)
start "Frontend" cmd /k "npm run dev"
cd ..

echo.
echo =========================================
echo AquaGuard AI Stack is starting up!
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:3001/docs
echo =========================================
echo.
pause
