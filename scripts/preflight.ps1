param(
  [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message"
}

Write-Step "Checking required project files"
$required = @(
  "public/index.html",
  "public/owner.html",
  "public/move.html",
  "public/app.js",
  "public/config.js",
  "worker/src/index.js",
  "worker/migrations/0001_initial.sql",
  "worker/wrangler.toml",
  ".github/workflows/pages.yml",
  ".github/workflows/worker.yml",
  "README.md"
)

foreach ($path in $required) {
  if (-not (Test-Path $path)) {
    throw "Missing required file: $path"
  }
}

Write-Step "Running JavaScript syntax checks"
& $NodePath --check public/app.js
& $NodePath --check public/config.js
& $NodePath --check worker/src/index.js
& $NodePath --check scripts/serve-public.mjs
& $NodePath --check scripts/mock-api.mjs
& $NodePath --check scripts/verify-mvp.mjs
& $NodePath --check scripts/verify-worker.mjs

Write-Step "Running MVP verification"
& $NodePath scripts/verify-mvp.mjs

Write-Step "Running Worker privacy/rate-limit verification"
& $NodePath scripts/verify-worker.mjs

Write-Step "Checking deployment placeholders"
$wrangler = Get-Content worker/wrangler.toml -Raw
if ($wrangler -match "replace-with-your-d1-database-id") {
  Write-Warning "worker/wrangler.toml still has a placeholder D1 database_id. Replace it after creating the D1 database."
}

$config = Get-Content public/config.js -Raw
if ($config -match 'MOVE_CAR_API_BASE\s*=\s*""') {
  Write-Warning "public/config.js has an empty Worker API URL. Fill it before final GitHub Pages deployment."
}

Write-Host ""
Write-Host "Preflight passed."
