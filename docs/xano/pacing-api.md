# Xano + API: Pacing group (`api:9v_k2NR8`)

This spec mirrors how Finance endpoints use **`XANO_CLIENTS_BASE_URL`**: the same Xano instance / API group prefix. Implement tables and REST routes in Xano, then this Next.js app proxies CRUD through **`/api/pacing/*`** and runs Snowflake reads via **`querySnowflake`** from **`@/lib/snowflake/client`**.

## TypeScript types

- **`lib/xano/pacing-types.ts`** — table rows, enums, list envelopes, Snowflake DTOs.
- **`lib/xano/pacing-client.ts`** — browser/server `fetch` helpers targeting **`/api/pacing/*`** (same pattern as **`lib/finance/api.ts`** / **`FinanceHttpError`**).

## Conventions

- **snake_case** JSON fields everywhere.
- Foreign keys: **`clients_id`**, **`users_id`**, **`media_plan_id`**.
- List responses from this app use **`{ "data": [...] }`**. Xano may return a bare array or **`{ data: [...] }`**; routes normalize with **`parseXanoListPayload`** where applicable.
- **Tenant scope**: non-admin users with **`client_slugs`** (or related claims — see **`getUserClientSlugs`** in **`lib/rbac.ts`**) only see Snowflake rows and Xano **`pacing_mappings` / `pacing_thresholds`** for resolved Xano **`get_clients.id`** values. Admin users (or users without slug claims) are unscoped.

## Snowflake write-through: `DIM_PLAN_MAPPING`

Xano **`pacing_mappings`** is mirrored into **`ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING`** on every successful **`POST` / `PATCH` / `DELETE`** via **`/api/pacing/mappings`** (see **`lib/snowflake/pacing-mapping-sync.ts`**).

- **Merge key:** **`XANO_MAPPING_ID`** = Xano row **`id`**. Add the column with **`sql/snowflake/pacing/10_dim_plan_mapping_xano_mapping_id.sql`** (then add a **UNIQUE** constraint when backfilled).
- **Upsert:** `MERGE` on **`XANO_MAPPING_ID`**.
- **Delete:** Xano hard-delete still triggers a Snowflake **soft delete** (`IS_ACTIVE = FALSE`, **`UPDATED_AT`** set) so facts stay joinable.
- **After each successful Snowflake write:** `ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH`.
- **Recovery:** Admin **`POST /api/pacing/mappings/resync`** — transactional **`DELETE`** (all dim rows) + reload from Xano + dynamic table refresh. UI: **`/pacing/settings`**.
- **Xano-only writes:** If buyers mutate Xano without Next.js, call **`POST /api/pacing/mappings/sync`** with header **`x-pacing-webhook-secret: $PACING_MAPPINGS_WEBHOOK_SECRET`** and body **`{ "action": "upsert", "mapping": { ... } }`** or **`{ "action": "delete", "mapping_id": 123 }`**.

If Snowflake sync fails after Xano succeeded, the API returns **502** with **`xano_ok: true`** when applicable; use **Resync** to repair.

## Xano tables (buyer CRUD; Snowflake sync is coordinated by Next.js)

### `pacing_mappings`

Mapping from AV line items to platform delivery patterns (synced to Snowflake out-of-band).

**Xano DDL (add if missing):** `av_line_item_code` **VARCHAR(64)** nullable; extend **`match_type`** enum with **`suffix_id`**; ensure **`campaign_name_pattern`** is nullable (unused for `suffix_id`).

**Paid search:** Rows with **`media_type = search`**, **`platform = google_ads`**, **`match_type = suffix_id`** are **automatically created and updated** from **`media_plan_search`** (`line_item_id` → **`av_line_item_code`** and **`av_line_item_id`**). Use **`POST /api/pacing/mappings/sync-from-search-containers`** (or save a media plan with search) to refresh; use the mappings UI mainly for **non-search** channels or special cases.

| Column | Type | Notes |
|--------|------|--------|
| `id` | int | PK |
| `clients_id` | int | FK → clients |
| `media_plan_id` | int? | FK → **media plan version** (`media_plan_versions.id`) |
| `av_line_item_id` | text | AV / plan line identifier |
| `av_line_item_label` | text? | |
| `media_type` | text? | |
| `platform` | text? | Lowercase connector key. Examples: **`google_ads`**, **`meta`**, **`dv360`**, **`tiktok`**, **`linkedin`**, **`the_trade_desk`**, **`direct`**. Allowed values per line item depend on **`media_type`** — see **`MEDIA_TYPE_CONFIG`** in **`lib/pacing/media-type-config.ts`**. |
| `match_type` | text | `exact` \| `prefix` \| `regex` \| `suffix_id` |
| `campaign_name_pattern` | text? | Ignored when `match_type` = `suffix_id` |
| `group_name_pattern` | text? | Ignored when `match_type` = `suffix_id` |
| `av_line_item_code` | text? | Required when `match_type` = `suffix_id`: suffix after last `-` in ad group / asset group name (same rule as dashboard line-item code). Synced to Snowflake `DIM_PLAN_MAPPING.AV_LINE_ITEM_CODE`. |
| `budget_split_pct` | number | default **100** |
| `line_item_budget` | number? | |
| `start_date` | date? | |
| `end_date` | date? | |
| `is_active` | bool | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `created_by_users_id` | int? | FK → users |

### `pacing_thresholds`

Per-client pacing tolerance defaults.

| Column | Type | Notes |
|--------|------|--------|
| `id` | int | PK |
| `clients_id` | int | unique per client |
| `on_track_pct` | number | default **0.05** |
| `slightly_threshold_pct` | number | default **0.15** |
| `no_delivery_days` | int | default **2** |
| `updated_at` | timestamp | |

### `pacing_saved_views`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int | PK |
| `users_id` | int | FK → users |
| `name` | text | |
| `filters_json` | json | opaque filter blob |
| `is_default` | bool | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### `pacing_alert_subscriptions`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int | PK |
| `users_id` | int | FK → users |
| `clients_ids` | array of number | |
| `media_types` | array of text | |
| `min_severity` | text | `warning` \| `critical` (or `info` if you allow) |
| `send_time_local` | time | |
| `timezone` | text | default **`Australia/Melbourne`** |
| `channel` | text | default **`email`** |
| `send_when_no_alerts` | bool | default **false** |
| `is_active` | bool | |

### `pacing_alert_log`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int | PK |
| `subscription_id` | int | FK → pacing_alert_subscriptions |
| `users_id` | int | denormalized recipient |
| `sent_at` | timestamp | |
| `alert_count` | int | |
| `status` | text | e.g. sent / failed |
| `error_message` | text? | |

## Xano REST paths (under `XANO_CLIENTS_BASE_URL`)

Mirror Finance naming (underscore resources):

- `GET/POST pacing_mappings` — list filters: `clients_id`, `media_type`, `platform`, `is_active`
- `GET/PATCH/DELETE pacing_mappings/{id}`
- `GET/PATCH pacing_thresholds` — `GET` query: `clients_id`; `PATCH` upserts by **`clients_id`** in body
- `GET/POST pacing_saved_views`
- `PATCH/DELETE pacing_saved_views/{id}`
- `POST pacing_saved_views/{id}/set-default`
- `GET/POST pacing_alert_subscriptions`
- `PATCH/DELETE pacing_alert_subscriptions/{id}`

`pacing_alert_log` is typically writer-only (worker); optional `GET` for admin diagnostics.

## Next.js API (`/api/pacing/*`)

All routes require an Auth0 session (see **`requirePacingAccess`**). Responses use **`Cache-Control: no-store`**.

### Snowflake (AssembledView)

| Method | Path | Source |
|--------|------|--------|
| GET | `/api/pacing/line-items?clients_id=&media_type=&status=&search=` | `ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING` |
| GET | `/api/pacing/line-items/{av_line_item_id}/history?days=30` | `ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING_DAILY` |
| GET | `/api/pacing/delivery?av_line_item_id= (required)&platform=&group_type=` | `ASSEMBLEDVIEW.VW_PACING.V_DELIVERY_PACING` |
| GET | `/api/pacing/alerts?clients_id=&severity=&media_type=` | `ASSEMBLEDVIEW.VW_PACING.V_PACING_ALERTS` |
| POST | `/api/pacing/mappings/test-match` | `ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY` (match rules; up to **50** distinct campaign/group tuples) |

**Client scoping:** list endpoints intersect optional `clients_id` with the caller’s allowed client id set. History and delivery restrict by **`AV_LINE_ITEM_ID`** only if it appears in **`V_LINE_ITEM_PACING`** for allowed clients (subquery), so daily/delivery views need not expose **`CLIENTS_ID`**.

### Xano proxy

| Method | Path | Upstream |
|--------|------|----------|
| GET/POST | `/api/pacing/mappings` | `pacing_mappings` |
| GET/PATCH/DELETE | `/api/pacing/mappings/{id}` | `pacing_mappings/{id}` |
| POST | `/api/pacing/mappings/sync-from-search-containers` | Reads **`media_plan_search`** (Xano Media Plans API), upserts **`suffix_id`** search rows in **`pacing_mappings`**, optional **`clients_id`** / **`media_plan_version_id`** in JSON body; MERGEs Snowflake **`DIM_PLAN_MAPPING`** and refreshes **`FACT_LINE_ITEM_PACING_DAILY`** |
| POST | `/api/pacing/mappings/prepare-search-container-delete` | Body **`{ search_container_id }`**: deactivate derived mapping before client **`DELETE`** on **`media_plan_search`** |
| POST | `/api/pacing/mappings/test-match` | _(Snowflake only — not Xano)_ |
| GET/PATCH | `/api/pacing/thresholds` | `pacing_thresholds` |
| GET/POST | `/api/pacing/saved-views` | `pacing_saved_views` |
| PATCH/DELETE | `/api/pacing/saved-views/{id}` | `pacing_saved_views/{id}` |
| POST | `/api/pacing/saved-views/{id}/set-default` | `pacing_saved_views/{id}/set-default` |
| GET/POST | `/api/pacing/alert-subscriptions` | `pacing_alert_subscriptions` |
| PATCH/DELETE | `/api/pacing/alert-subscriptions/{id}` | `pacing_alert_subscriptions/{id}` |

## Snowflake view column expectations

The server maps common uppercase column names to **`lib/xano/pacing-types`** shapes. Views should expose at least:

- **Line items:** `CLIENTS_ID`, `MEDIA_PLAN_ID`, `AV_LINE_ITEM_ID`, `AV_LINE_ITEM_LABEL`, `MBA_NUMBER`, `CAMPAIGN_NAME`, `MEDIA_TYPE`, `PLATFORM`, pacing fields (`PACING_STATUS` or `STATUS`, spend/budget columns as available).
- **Daily:** `AV_LINE_ITEM_ID`, `DELIVERY_DATE` or `DATE_DAY`, spend / metrics columns.
- **Delivery:** `AV_LINE_ITEM_ID`, `PLATFORM`, `GROUP_TYPE`, `CAMPAIGN_NAME`, `GROUP_NAME`, `DELIVERY_DATE` / `DATE_DAY`, spend.
- **Alerts:** `CLIENTS_ID`, `SEVERITY`, `MEDIA_TYPE`, `AV_LINE_ITEM_ID`, message / code columns.
- **FACT_DELIVERY_DAILY (test match):** `PLATFORM`, `DELIVERY_DATE` or `DATE_DAY`, `CAMPAIGN_NAME`, `GROUP_NAME`, `GROUP_TYPE`.

If your DDL uses different names, adjust **`lib/pacing/pacingMart.ts`** mappers.

## Enums (API)

- **Pacing status:** `not_started` \| `on_track` \| `slightly_under` \| `under_pacing` \| `slightly_over` \| `over_pacing` \| `no_delivery` \| `completed`
- **Severity:** `info` \| `warning` \| `critical`
- **Delivery health:** `spending` \| `no_delivery` \| `no_recent_delivery` \| `paused_yesterday`
- **Group type:** `campaign` \| `ad_group` \| `asset_group` \| `ad_set` \| `line_item`
- **Match type:** `exact` \| `prefix` \| `regex` \| `suffix_id`
