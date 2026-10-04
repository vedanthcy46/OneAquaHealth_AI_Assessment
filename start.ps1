# AquaGuard AI - Stack Starter
$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Starting AquaGuard AI Stack" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Cloud vs Local DB check
$isLocal = $false
if (Test-Path "$PSScriptRoot\backend\.env") {
    $envContent = Get-Content "$PSScriptRoot\backend\.env" -Raw
    if ($envContent -match "localhost:5432") {
        $isLocal = $true
    }
}

if ($isLocal) {
    Write-Host "[1] Local database detected. Checking Docker..." -ForegroundColor Yellow
    try {
        docker info | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker is running. Starting containers..." -ForegroundColor Green
            Set-Location "$PSScriptRoot\backend"
            docker-compose up -d
        } else {
            Write-Host "Docker is not running." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Docker not detected. Continuing directly..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[1] Cloud DB (Neon) and Redis (Upstash) active in .env (No Docker needed)" -ForegroundColor Green
}

# 2. Python AI Service (optional)
Write-Host ""
Write-Host "[2] Checking Python AI Service..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot"
if (-not (Test-Path "$PSScriptRoot\ai\.venv")) {
    try {
        python -m venv "$PSScriptRoot\ai\.venv" 2>$null
    } catch {}
}
if (Test-Path "$PSScriptRoot\ai\.venv\Scripts\pip.exe") {
    Start-Process -FilePath "$PSScriptRoot\ai\.venv\Scripts\pip.exe" -ArgumentList "install -r ai\requirements.txt -q" -Wait -NoNewWindow
    Write-Host "Python AI dependencies ready." -ForegroundColor Green
} else {
    Write-Host "Python virtual environment skipped; built-in AI heuristics active." -ForegroundColor Gray
}

# 3. Database Migration & Backend Startup
Write-Host ""
Write-Host "[3] Database Migration and Backend Startup..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"
npm run migrate
npm run seed

# Start Backend API dev server in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='AquaGuard Backend API'; Set-Location '$PSScriptRoot\backend'; npm run dev"

# 4. Start AI Worker in a new window
Write-Host ""
Write-Host "[4] Starting AI Queue Worker..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='AquaGuard AI Worker'; Set-Location '$PSScriptRoot\backend'; npx ts-node src/workers/ai.worker.ts"

# 5. Start Frontend in a new window
Write-Host ""
Write-Host "[5] Starting Frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"
if (-not (Test-Path "$PSScriptRoot\frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..."
    npm install
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='AquaGuard Frontend'; Set-Location '$PSScriptRoot\frontend'; npm run dev"

Set-Location "$PSScriptRoot"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "AquaGuard AI Stack is RUNNING!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173"
Write-Host "API Docs: http://localhost:3001/docs"
Write-Host "Health:   http://localhost:3001/health"
Write-Host "=========================================" -ForegroundColor Green
