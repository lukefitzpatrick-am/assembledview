# Smoke scripts

Manual checks against a running dev server (`npm run dev` or equivalent). These scripts do not send credentials; `/api` routes in this app are not protected by Next.js middleware, so local smoke calls are typically unauthenticated.

## `pacing-portfolio.ps1`

Exercises `POST /api/pacing/portfolio` with a line item id and date range, then prints row count, `dataAsAt`, `totals`, and the first and last `daily` row (field shape + ISO dates).

**Example (defaults match Stage 1b):**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke/pacing-portfolio.ps1
```

**Parameters:**

| Parameter    | Default            | Description                    |
| ------------ | ------------------ | ------------------------------ |
| `LineItemId` | `curatif002se1`    | Single line item to query      |
| `StartDate`  | `2025-04-01`       | Inclusive `YYYY-MM-DD`         |
| `EndDate`    | `2026-05-12`       | Inclusive `YYYY-MM-DD`         |
| `BaseUrl`    | `http://localhost:3000` | Origin only (no path)     |

**Raw JSON (optional):** confirm `daily[].date` and `dataAsAt` are `YYYY-MM-DD` on the wire, not locale strings:

```powershell
$body = @{ lineItemIds = @("curatif002se1"); startDate = "2025-04-01"; endDate = "2026-05-12" } | ConvertTo-Json
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/pacing/portfolio" -Method Post -Body $body -ContentType "application/json; charset=utf-8"
$r.Content.Substring(0, [Math]::Min(400, $r.Content.Length))
```

### Baseline: `curatif002se1` (SEARCH_PACING_FACT)

Point-in-time reference from a successful Stage 1b run; live spend will grow as the campaign runs.

| Metric        | Expected (approx.) |
| ------------- | ------------------: |
| Amount spent  |       \$66,917.67   |
| Impressions   |         2,760,685   |
| Clicks        |            35,157   |
| Conversions   |           1,366.31  |
| Revenue       |      \$273,650.35   |
| Daily rows    | ~350–400 (one row per calendar day with delivery after aggregation) |

`results` and `video3sViews` should be **0** in totals and daily rows for search-sourced data, because `SEARCH_PACING_FACT` does not expose those measures (the API still returns the keys for a stable row shape).
