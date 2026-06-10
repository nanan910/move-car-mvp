param(
  [string]$ApiBase = "",
  [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"

function Resolve-CommandPath {
  param(
    [string]$Preferred,
    [string]$Fallback
  )
  if ($Fallback -and (Test-Path $Fallback)) { return $Fallback }
  if (Get-Command $Preferred -ErrorAction SilentlyContinue) {
    return (Get-Command $Preferred).Source
  }
  throw "$Preferred is required."
}

function Read-SecretText {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  if ($secure.Length -eq 0) { return "" }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Read-PublicWorkerUrl {
  $config = Get-Content public/config.js -Raw
  $match = [regex]::Match($config, 'MOVE_CAR_API_BASE\s*=\s*"([^"]+)"')
  if (-not $match.Success -or -not $match.Groups[1].Value) {
    return "https://move-car-api.nanan910-move-car.workers.dev"
  }
  return $match.Groups[1].Value.TrimEnd("/")
}

$node = Resolve-CommandPath $NodePath "D:\nodejs\node.exe"
if (-not $ApiBase) { $ApiBase = Read-PublicWorkerUrl }

Write-Host "This will create disposable production test bindings and send real notifications."
Write-Host "Leave a field empty to skip that channel. Values are not written to the repository."
Write-Host ""

$showdocWebhook = Read-SecretText "SHOWDOC_WEBHOOK"
$showdocToken = Read-SecretText "SHOWDOC_TOKEN optional"
$wechatWorkWebhook = Read-SecretText "WECHAT_WORK_WEBHOOK"

if (-not $showdocWebhook -and -not $wechatWorkWebhook) {
  throw "Provide at least SHOWDOC_WEBHOOK or WECHAT_WORK_WEBHOOK."
}

$previousApiBase = $env:MOVE_CAR_API_BASE
$previousShowdocWebhook = $env:SHOWDOC_WEBHOOK
$previousShowdocToken = $env:SHOWDOC_TOKEN
$previousWechatWorkWebhook = $env:WECHAT_WORK_WEBHOOK

try {
  $env:MOVE_CAR_API_BASE = $ApiBase
  $env:SHOWDOC_WEBHOOK = $showdocWebhook
  $env:SHOWDOC_TOKEN = $showdocToken
  $env:WECHAT_WORK_WEBHOOK = $wechatWorkWebhook
  & $node scripts/verify-production-notifications.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Production notification verification failed."
  }
} finally {
  $env:MOVE_CAR_API_BASE = $previousApiBase
  $env:SHOWDOC_WEBHOOK = $previousShowdocWebhook
  $env:SHOWDOC_TOKEN = $previousShowdocToken
  $env:WECHAT_WORK_WEBHOOK = $previousWechatWorkWebhook
}
