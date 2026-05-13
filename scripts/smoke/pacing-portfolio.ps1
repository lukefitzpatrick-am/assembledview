<#.SYNOPSIS
  Smoke test: POST /api/pacing/portfolio and print summary metrics.

.DESCRIPTION
  No secrets or auth — local dev assumes the API is reachable as given.
  See scripts/smoke/README.md for baseline expectations.
#>
param(
  [string]$LineItemId = "curatif002se1",
  [string]$StartDate = "2025-04-01",
  [string]$EndDate = "2026-05-12",
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$root = $BaseUrl.TrimEnd("/")
if ($root -notmatch "^https?://") {
  $root = "http://$($root.TrimStart("/"))"
}
$uri = "$root/api/pacing/portfolio"

$body = @{
  lineItemIds = @($LineItemId)
  startDate   = $StartDate
  endDate     = $EndDate
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri $uri `
  -Method Post `
  -Body $body `
  -ContentType "application/json; charset=utf-8"

"daily row count: $($response.daily.Count)"
"dataAsAt: $($response.dataAsAt)"
"--- totals ---"
$response.totals | ConvertTo-Json -Depth 5
if ($response.daily.Count -eq 0) {
  "--- daily: (none) ---"
} else {
  "--- first daily ---"
  $response.daily[0] | ConvertTo-Json -Depth 5
  "--- last daily ---"
  $response.daily[-1] | ConvertTo-Json -Depth 5
}
