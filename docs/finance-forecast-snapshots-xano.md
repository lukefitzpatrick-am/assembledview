# Finance Forecast snapshots — Xano data model

Immutable, point-in-time copies of the **calculated** Finance Forecast (the same shape as `FinanceForecastDataset` in the app). Snapshots are **not** derived from altering `media_plan_versions`; they are a durable audit trail keyed by capture time and filters.

## Tables

### `finance_forecast_snapshots` (header)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid / int | Primary key |
| `snapshot_label` | text | Human title (e.g. “March 2026 close”) |
| `snapshot_type` | text / enum | e.g. `manual`, `scheduled`, `month_close`, `adhoc` |
| `financial_year` | int | Australian FY start year (1 July), e.g. `2025` |
| `scenario` | text | `confirmed` \| `confirmed_plus_probable` |
| `taken_at` | timestamp | When the snapshot was stored (UTC recommended) |
| `taken_by` | text | Auth0 `sub`, email, or display id |
| `notes` | text nullable | Free text |
| `source_version_summary` | text nullable | JSON: `{ raw_version_count, filtered_version_count, client_scope, include_row_debug }` |
| `filter_context_json` | text nullable | JSON: UI/API filters used when computing the dataset (client filter, search, etc.) |
| `created_at` | timestamp | Set on insert |

**Immutability:** Do not expose PATCH/PUT on this table. Optionally add a `locked` boolean set `true` on insert and reject updates in Xano middleware if `locked`.

### `finance_forecast_snapshot_lines` (detail)

One row per **month** for each logical forecast line (12 rows per line per version row). This grain supports:

- **Month-on-month** comparisons (`month_key` + `amount`)
- **Client** rollups (`client_id`)
- **Line category** rollups (`group_key`, `line_key`)
- **Two-snapshot diff** joins on natural key below

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid / int | Primary key |
| `snapshot_id` | fk → snapshots | Required |
| `client_id` | text | Normalised string id |
| `client_name` | text | Display name at capture |
| `campaign_id` | text nullable | When available |
| `mba_number` | text nullable | When available |
| `media_plan_version_id` | text / int nullable | Points at version row id for traceability only (no FK required) |
| `version_number` | int nullable | Plan version number |
| `group_key` | text | Billing vs revenue block (app constants) |
| `line_key` | text | Forecast line id (app constants) |
| `month_key` | text | `july` … `june` |
| `amount` | decimal | **Numeric** AUD for that month |
| `fy_total` | decimal | FY total for the logical line (same on all 12 rows — convenient for aggregates) |
| `source_hash` | text nullable | SHA-256 hex from `hashFinanceForecastLineForSnapshot` (see `lib/finance/forecast/snapshot`) |
| `source_debug_json` | text nullable | JSON of row debug when captured |

**Immutability:** INSERT only; no UPDATE/DELETE in production APIs (optional admin purge policy).

### Recommended indexes

- Lines: `(snapshot_id, client_id, line_key, month_key)`
- Lines: `(snapshot_id, group_key, line_key, month_key)`
- Lines: `(snapshot_id, month_key)`
- Headers: `(financial_year, scenario, taken_at DESC)`

### Natural comparison key (app + SQL)

Match rows between two snapshots for like-for-like diffs:

`client_id` + `media_plan_version_id` (nullable) + `group_key` + `line_key` + `month_key`

See `snapshotLineComparisonKey` in `lib/finance/forecast/snapshot/compareSnapshotLines.ts`.

## Next.js API (this repo)

### Server-computed snapshot (UI default, **admin only**)

`POST /api/finance/forecast/snapshots` with JSON:

- `financial_year` (or `fy`), `scenario` (`confirmed` | `confirmed_plus_probable`)
- `notes` (optional)
- `client` / `client_filter`, `search` / `q`, `debug` / `include_row_debug` (optional — same semantics as GET `/api/finance/forecast`)
- `force_duplicate` (optional boolean): bypass the 90s duplicate guard and append `· Repeat capture` to the auto label

The route runs **`loadFinanceForecastDataset`** on the server (does not reuse the on-screen payload), then builds **`source_version_summary`** (versions used + `calculation_*` timestamps + `dataset_hash`) and **`filter_context_json`** (filters + timing). Duplicate protection is **process-local** (double-submit); add a unique index in Xano (e.g. on `dataset_hash` + `taken_by` + minute bucket) for distributed enforcement.

Response: `{ ok, persisted, snapshot_label, taken_at, line_count, dataset_hash, snapshot_id?, reason? }`.

### Legacy: client-supplied dataset

`POST` with `snapshot_label` + `dataset` (full `FinanceForecastDataset`) for integrations/tests.

### Persistence

- If `XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL` is unset, returns `persisted: false` (no staging blob in the server-computed path — use `dataset_hash` for QA).
- If set, POSTs to `{BASE}/finance_forecast_snapshots_create` with `{ header, lines }`.

### Read APIs (variance UI)

Implement in the same Xano API group (or adjust env paths):

| App route | Xano verb (default name) | Purpose |
|-----------|--------------------------|--------|
| `GET /api/finance/forecast/snapshots` | `finance_forecast_snapshots_list` | Returns array of `finance_forecast_snapshots` rows |
| `GET /api/finance/forecast/snapshots/[id]/lines` | `finance_forecast_snapshot_lines?snapshot_id=` | Returns lines for one snapshot |
| `POST /api/finance/forecast/snapshots/variance` | *(server-only)* | Loads two line sets and runs `compareFinanceForecastSnapshots` |

Override names with `XANO_FINANCE_FORECAST_SNAPSHOTS_LIST_PATH` and `XANO_FINANCE_FORECAST_SNAPSHOTS_LINES_PATH` if needed.

Implement the Xano function to:

1. Insert header → obtain `snapshot_id`
2. Bulk insert lines with that `snapshot_id`
3. Return `{ snapshot_id }`

Rename `finance_forecast_snapshots_create` in Xano to match your conventions; update `xanoPersistSnapshot.ts` accordingly.

## Comparison helpers (app layer)

Pure functions (no DB required):

- `compareFinanceForecastSnapshotLines` — row-level month deltas
- `compareSnapshotsByMonth` — FY-wide total per fiscal month
- `compareSnapshotsByClient` — totals per client
- `compareSnapshotsByLineCategory` — totals per `group_key` + `line_key`

Load two snapshots’ lines from Xano (filter `snapshot_id`), then run the comparators in `lib/finance/forecast/snapshot/compareSnapshotLines.ts`.
