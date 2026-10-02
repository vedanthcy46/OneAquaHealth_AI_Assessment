<#
.SYNOPSIS
Starts the AquaGuard AI stack (Database, Redis, Backend API, Backend Worker, and Frontend).

.DESCRIPTION
This script checks dependencies, ensures Docker Desktop is running, starts the backend and worker processes,
installs required Python packages, and starts the frontend.
#>

$ErrorActionPreference = "Stop"

Write-Host "🌊 Starting AquaGuard AI Stack..." -ForegroundColor Cyan

# 1. Check if Docker is running
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
    Write-Host "✅ Docker is running." -ForegroundColor Green
} catch {
    Write-Host "⚠️ Docker Engine is not running. Starting Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "⏳ Waiting for Docker to start (30 seconds)..."
    Start-Sleep -Seconds 30
    docker info > $null
    Write-Host "✅ Docker is ready." -ForegroundColor Green
}

# 2. Start PostgreSQL and Redis via Docker Compose
Write-Host "📦 Starting Database and Redis..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"
docker-compose up -d

# 3. Setup Python AI environment
Write-Host "🐍 Setting up Python AI Service..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot"
if (-not (Test-Path "ai\.venv")) {
    Write-Host "   Creating virtual environment..."
    python -m venv ai\.venv
}
& "ai\.venv\Scripts\pip.exe" install -r ai\requirements.txt -q
Write-Host "✅ Python AI dependencies installed." -ForegroundColor Green

# 4. Start Backend API
Write-Host "🚀 Starting Backend API..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"
Write-Host "   Running database migrations..."
npm run migrate
Write-Host "   Seeding database..."
npm run seed

# Start the dev server in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$host.ui.RawUI.WindowTitle='Backend API'; npm run dev"

# 5. Start Backend Worker
Write-Host "⚙️ Starting AI Queue Worker..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$host.ui.RawUI.WindowTitle='AI Worker'; npx ts-node src/workers/ai.worker.ts"

# 6. Start Frontend
Write-Host "🌐 Starting Frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"
if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing frontend dependencies..."
    npm install
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$host.ui.RawUI.WindowTitle='Frontend'; npm run dev"

Write-Host "=========================================" -ForegroundColor Green
Write-Host "✨ AquaGuard AI Stack is starting up!" -ForegroundColor Green
Write-Host "📍 Frontend: http://localhost:5173"
Write-Host "📍 API Docs: http://localhost:3001/docs"
Write-Host "=========================================" -ForegroundColor Green
