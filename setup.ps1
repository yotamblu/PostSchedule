#Requires -Version 5.1
<#
.SYNOPSIS
  PostSchedule one-click setup
.DESCRIPTION
  Installs Node.js (if needed), npm packages, Playwright Chromium,
  and creates a desktop shortcut.
#>

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

# ── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step  ($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "  ✓  $msg" -ForegroundColor Green }
function Write-Warn  ($msg) { Write-Host "  !  $msg" -ForegroundColor Yellow }
function Write-Fail  ($msg) { Write-Host "  ✗  $msg" -ForegroundColor Red }

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable('PATH','Machine')
  $user    = [System.Environment]::GetEnvironmentVariable('PATH','User')
  $env:PATH = "$machine;$user"
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor DarkGray
Write-Host "  ║        PostSchedule  Setup           ║" -ForegroundColor White
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor DarkGray
Write-Host ""

$root = $PSScriptRoot

# ── Step 1: Node.js ──────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."

$needNode = $true
try {
  $raw   = & node --version 2>&1
  $major = if ($raw -match 'v(\d+)') { [int]$Matches[1] } else { 0 }
  if ($major -ge 18) {
    Write-Ok "Node.js $raw already installed"
    $needNode = $false
  } else {
    Write-Warn "Node.js $raw is too old (need v18+) — will upgrade"
  }
} catch {
  Write-Warn "Node.js not found — will install"
}

if ($needNode) {
  # Try winget first (built into Windows 10 1809+ and all of Windows 11)
  $wingetOk = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
  if ($wingetOk) {
    Write-Step "Installing Node.js LTS via winget..."
    winget install OpenJS.NodeJS.LTS `
      --silent `
      --accept-package-agreements `
      --accept-source-agreements | Out-Null
    Refresh-Path
    Write-Ok "Node.js installed"
  } else {
    Write-Fail "winget not available."
    Write-Host ""
    Write-Host "  Please install Node.js 18+ manually from:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/en/download" -ForegroundColor White
    Write-Host "  Then re-run this script." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
  }
}

# ── Step 2: npm install ───────────────────────────────────────────────────────
Write-Host ""
Write-Step "Installing npm packages..."

Set-Location $root
try {
  npm install --prefer-offline 2>&1 | ForEach-Object { "    $_" }
  Write-Ok "npm packages installed"
} catch {
  # Retry with SSL verification off (corporate proxies with SSL inspection)
  Write-Warn "npm install failed — retrying with SSL bypass..."
  $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
  npm install 2>&1 | ForEach-Object { "    $_" }
  $env:NODE_TLS_REJECT_UNAUTHORIZED = $null
  Write-Ok "npm packages installed (SSL bypass used)"
}

# ── Step 3: Playwright Chromium ───────────────────────────────────────────────
Write-Host ""
Write-Step "Installing Playwright Chromium browser..."

try {
  node node_modules/playwright/cli.js install chromium 2>&1 |
    ForEach-Object { "    $_" }
  Write-Ok "Playwright Chromium installed"
} catch {
  Write-Warn "Chromium install failed — retrying with SSL bypass..."
  $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
  node node_modules/playwright/cli.js install chromium 2>&1 |
    ForEach-Object { "    $_" }
  $env:NODE_TLS_REJECT_UNAUTHORIZED = $null
  Write-Ok "Playwright Chromium installed (SSL bypass used)"
}

# ── Step 4: Desktop shortcut ──────────────────────────────────────────────────
Write-Host ""
Write-Step "Creating desktop shortcut..."

# launcher.bat – sits in the project root, hidden from view
$launcherPath = Join-Path $root 'launcher.bat'
Set-Content -Path $launcherPath -Value "@echo off`r`ncd /d `"%~dp0`"`r`nnpm start`r`n" -Encoding ascii

$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'PostSchedule.lnk'
$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($desktopLnk)
$shortcut.TargetPath       = $launcherPath
$shortcut.WorkingDirectory = $root
$shortcut.Description      = 'PostSchedule — organic X post scheduler'
# Use the electron exe as the shortcut icon if available, otherwise no icon
$electronExe = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (Test-Path $electronExe) { $shortcut.IconLocation = "$electronExe,0" }
$shortcut.Save()

Write-Ok "Shortcut created on Desktop"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ══════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "   Setup complete!  Double-click" -NoNewline -ForegroundColor Green
Write-Host " PostSchedule" -NoNewline -ForegroundColor White
Write-Host " on your Desktop." -ForegroundColor Green
Write-Host "   Or run: npm start" -ForegroundColor DarkGray
Write-Host "  ══════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""
