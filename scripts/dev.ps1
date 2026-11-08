# DecisionPilot AI - Windows Local Dev Launcher
$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path "$PSScriptRoot\..").Path
$python = "$rootDir\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

Set-Location $rootDir

Write-Host "[1/3] Ensuring database migrations are up to date..." -ForegroundColor Cyan
& $python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }

Write-Host "[2/3] Verifying bootstrap dataset..." -ForegroundColor Cyan
& $python -m scripts.bootstrap
if ($LASTEXITCODE -ne 0) { throw "Dataset bootstrap failed." }

Write-Host "[3/3] Starting Backend API, Frontend Workspace & Docs Site..." -ForegroundColor Green
Write-Host "-> Backend API: http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "-> API Docs:    http://127.0.0.1:8000/api/docs" -ForegroundColor Yellow
Write-Host "-> Frontend:    http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "-> Docs Site:   http://127.0.0.1:5174/DecisionPilotAI/" -ForegroundColor Magenta

# Start backend uvicorn process
$backendOut = "$rootDir\artifacts\backend_out.log"
$backendErr = "$rootDir\artifacts\backend_err.log"
$backend = Start-Process -FilePath $python -ArgumentList "-m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000" -WorkingDirectory $rootDir -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru

# Start docs-site vite process
$docs = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "$rootDir\docs-site" -WindowStyle Hidden -PassThru

try {
    # Start frontend in foreground
    Set-Location "$rootDir\frontend"
    npm run dev -- --host 127.0.0.1 --port 5173
} finally {
    if ($backend -and -not $backend.HasExited) {
        Write-Host "Shutting down backend server..." -ForegroundColor Yellow
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    }
    if ($docs -and -not $docs.HasExited) {
        Write-Host "Shutting down docs-site server..." -ForegroundColor Yellow
        Stop-Process -Id $docs.Id -Force -ErrorAction SilentlyContinue
    }
}
