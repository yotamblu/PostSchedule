#Requires -Version 5.1
<#
.SYNOPSIS
  Build PostSchedule-Setup.exe
.DESCRIPTION
  Runs: vite build → playwright chromium download → electron-builder NSIS
  Output: out\PostSchedule Setup x.x.x.exe
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Write-Step ($msg) { Write-Host "`n  >> $msg" -ForegroundColor Cyan }
function Write-Ok   ($msg) { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Fail ($msg) { Write-Host "  !! $msg"  -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  PostSchedule — production build" -ForegroundColor White
Write-Host "  ================================" -ForegroundColor DarkGray

# ── 1. Vite build ─────────────────────────────────────────────────────────────
Write-Step "Building React UI (vite build)..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "vite build failed" }
Write-Ok "React UI built → dist/"

# ── 2. Playwright Chromium for bundling ───────────────────────────────────────
Write-Step "Downloading Playwright Chromium into ./playwright-browsers ..."
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $root 'playwright-browsers'
node node_modules/playwright/cli.js install chromium
if ($LASTEXITCODE -ne 0) {
  # Retry with SSL bypass (corporate proxies)
  Write-Host "  Retrying with SSL bypass..." -ForegroundColor Yellow
  $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
  node node_modules/playwright/cli.js install chromium
  $env:NODE_TLS_REJECT_UNAUTHORIZED = $null
  if ($LASTEXITCODE -ne 0) { Write-Fail "Playwright Chromium download failed" }
}
Write-Ok "Chromium ready in ./playwright-browsers"

# ── 3. electron-builder ───────────────────────────────────────────────────────
Write-Step "Packaging with electron-builder (NSIS x64)..."
npx electron-builder --win --x64
if ($LASTEXITCODE -ne 0) { Write-Fail "electron-builder failed" }

# ── Done ──────────────────────────────────────────────────────────────────────
$exe = Get-ChildItem -Path (Join-Path $root 'out') -Filter '*.exe' |
       Where-Object { $_.Name -notlike 'builder-*' } |
       Select-Object -First 1

Write-Host ""
Write-Host "  ================================================" -ForegroundColor DarkGray
Write-Host "   Installer ready:" -ForegroundColor Green
Write-Host "   $($exe.FullName)" -ForegroundColor White
Write-Host "  ================================================" -ForegroundColor DarkGray
Write-Host ""
