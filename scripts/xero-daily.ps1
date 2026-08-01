#Requires -Version 5.1
<#
.SYNOPSIS
  Daily Xero sync + parity for local Postgres (Option B runner).

.DESCRIPTION
  Resolves Node/npm even when Task Scheduler has a minimal PATH, then runs:
    npm run db:xero-sync
    npm run db:xero-parity
  Appends timestamped output to xero-daily.log in the repo root.

.NOTES
  Registered as Windows task "AV Xero daily parity" (daily 07:30).
  Manual (Option A): npm run db:xero-sync; npm run db:xero-parity
#>

$ErrorActionPreference = 'Continue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot 'package.json'))) {
  $RepoRoot = 'C:\Projects\avmediaplan'
}

Set-Location -LiteralPath $RepoRoot

# Task Scheduler often has a stripped PATH — prepend common Node locations.
$nodeDirs = @(
  'C:\Program Files\nodejs',
  "${env:ProgramFiles(x86)}\nodejs",
  "$env:LOCALAPPDATA\Programs\nodejs",
  "$env:APPDATA\npm"
)
foreach ($dir in $nodeDirs) {
  if ($dir -and (Test-Path -LiteralPath $dir) -and ($env:Path -notlike "*${dir}*")) {
    $env:Path = "$dir;$env:Path"
  }
}

$logPath = Join-Path $RepoRoot 'xero-daily.log'

function Write-XeroLog {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $logPath -Value $line
  Write-Host $line
}

function Invoke-NpmScript {
  param([Parameter(Mandatory)][string]$ScriptName)

  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npmCmd) {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npmCmd) {
    Write-XeroLog 'ERROR: npm not found. Install Node.js or add it to PATH for scheduled tasks.'
    return 1
  }

  Write-XeroLog ">>> npm run $ScriptName (via $($npmCmd.Source))"
  # Capture stdout+stderr into the log while still printing to the console.
  & $npmCmd.Source run $ScriptName 2>&1 | ForEach-Object {
    $text = "$_"
    Add-Content -LiteralPath $logPath -Value $text
    Write-Host $text
  }
  $code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  Write-XeroLog "<<< npm run $ScriptName exit=$code"
  return $code
}

Write-XeroLog '=== Xero daily start ==='
Write-XeroLog "cwd=$RepoRoot node=$(try { (Get-Command node).Source } catch { 'missing' })"

$syncExit = Invoke-NpmScript -ScriptName 'db:xero-sync'
$parityExit = Invoke-NpmScript -ScriptName 'db:xero-parity'

Write-XeroLog "=== Xero daily end (sync=$syncExit parity=$parityExit) ==="

if ($syncExit -ne 0) { exit $syncExit }
if ($parityExit -ne 0) { exit $parityExit }
exit 0
