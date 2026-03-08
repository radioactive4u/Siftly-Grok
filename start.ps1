# ── Siftly Launcher (Windows) ──────────────────────────────────────────────────
# Run this once to set up and start Siftly.
# After first run, just run it again to start the app.
# Usage:  .\start.ps1
# ───────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Siftly" -ForegroundColor Blue
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Node.js is required. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$nodeVersion = (node -v) -replace 'v', ''
$major = [int]($nodeVersion -split '\.')[0]
if ($major -lt 18) {
    Write-Host "  Node.js 18+ required (found v$nodeVersion)" -ForegroundColor Red
    exit 1
}

Write-Host "  Node.js v$nodeVersion" -ForegroundColor Green

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Generate Prisma client if needed
$prismaClient = "app/generated/prisma/client.ts"
if (-not (Test-Path $prismaClient)) {
    Write-Host "  Generating Prisma client..." -ForegroundColor Yellow
    npx prisma generate
}

# Create database if needed
if (-not (Test-Path "prisma/dev.db")) {
    Write-Host "  Creating database..." -ForegroundColor Yellow
    npx prisma db push
}

# Clear stale Turbopack cache (prevents 404s on routes after code changes)
if (Test-Path ".next") {
    Write-Host "  Clearing build cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "  Starting dev server..." -ForegroundColor Blue
Write-Host "  http://localhost:3000" -ForegroundColor Green
Write-Host ""

# Open browser after a short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 5
    Start-Process "http://localhost:3000"
} | Out-Null

npx next dev
