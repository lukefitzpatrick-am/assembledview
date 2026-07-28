# Xano Stage 2 schema — Plan C rows + `line_uid`

**Owner:** Luke builds tables/columns/endpoints via `.xs` workspace files.  
**App:** tolerates absence (404 / missing columns); Plan C stage-2 flags stay off until tables exist.  
**API group:** Media Plans (`RaUx9FOa` / `XANO_MEDIA_PLANS_BASE_URL`). Auth **ON** for all endpoints below.

---

## 1. Table `plan_billing_rows`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int (auto) | PK |
| `media_plan_version` | int | FK → `media_plan_versions.id`; **index** |
| `mba_number` | text | **index** |
| `line_uid` | text | **index** |
| `line_source` | text | enum-like: `channel` \| `production` \| `adserving` \| `fee` |
| `media_type` | text | channel / media type label |
| `month` | text | `YYYY-MM`; **index** |
| `media_amount` | decimal | |
| `fee_amount` | decimal | |
| `adserving_amount` | decimal | |
| `billable_amount` | decimal | |
| `client_pays_for_media` | bool | |
| `is_manual_override` | bool | |
| `source` | text | `auto` \| `manual` \| `balancing` |
| `override_id` | int \| null | nullable FK to override row when applicable |
| `created_at` | timestamp | Xano default ok |

**Constraint:** `UNIQUE (media_plan_version, line_uid, month)`.

---

## 2. Table `plan_delivery_rows`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int (auto) | PK |
| `media_plan_version` | int | FK → `media_plan_versions.id`; **index** |
| `mba_number` | text | **index** |
| `line_uid` | text | **index** |
| `line_source` | text | `channel` \| `production` \| `adserving` \| `fee` |
| `media_type` | text | |
| `month` | text | `YYYY-MM`; **index** |
| `delivery_amount` | decimal | |
| `media_amount_full` | decimal | |
| `created_at` | timestamp | Xano default ok |

**Constraint:** `UNIQUE (media_plan_version, line_uid, month)`.

---

## 3. Columns to ADD on channel + production tables

### 3a. All **19** channel tables (not production)

```
media_plan_television
media_plan_newspaper
media_plan_social
media_plan_radio
media_plan_magazines
media_plan_cinema
media_plan_digi_display
media_plan_digi_audio
media_plan_digi_video
media_plan_digi_bvod
media_plan_integrations
media_plan_search
media_plan_prog_display
media_plan_prog_video
media_plan_prog_bvod
media_plan_prog_audio
media_plan_prog_ooh
media_plan_ooh
media_plan_influencers
```

| Column | Type | Notes |
|--------|------|-------|
| `line_uid` | text | durable identity; rides in existing line-item payloads |
| `superseded` | bool | **default `false`** |

**Per-table uniqueness for live lines:**

- **Desired:** `UNIQUE (media_plan_version, line_uid) WHERE superseded = false` (partial unique).
- **Xano support (2026):** **No** — Xano does **not** expose partial / filtered unique indexes (community + docs: unique indexes apply to all rows). Feature requests exist; do not rely on UI/API for `WHERE` clauses.
- **Do instead:** plain **index** on `(media_plan_version, line_uid)` (non-unique is fine) **or** a full unique on `(media_plan_version, line_uid, superseded)` only if that matches product rules — prefer **non-unique composite index** + **app tripwire** (integrity cron / save-path check) that fails when two non-superseded rows share `(media_plan_version, line_uid)`.
- **Report for Luke:** use **plain index + tripwire** (no partial unique).

### 3b. `media_plan_production` (additionally)

Same as channel tables, **plus** the version FK it never had:

| Column | Type | Notes |
|--------|------|-------|
| `line_uid` | text | |
| `superseded` | bool | default `false` |
| `media_plan_version` | int | FK → `media_plan_versions.id` (**new**) |

Same uniqueness guidance: plain index on `(media_plan_version, line_uid)` + tripwire for `superseded = false`.

---

## 4. Endpoints (Media Plans group, auth ON)

Mirror the soft-fail / write-once style used for `mba_fee_snapshots` (app soft-fails if missing). Prefer a **single transactional stack** per bulk call (all inserts/patches succeed or none), same spirit as fee-snapshot multi-row writes for one version.

### 4a. `plan_billing_rows`

| Method | Path | Behaviour |
|--------|------|-----------|
| `POST` | `/plan_billing_rows/bulk` | Body: `{ rows: plan_billing_rows[] }`. Transactional multi-`db.add`. Return created ids / count. |
| `GET` | `/plan_billing_rows` | Query: `media_plan_version` (required), `page`, `per_page`. List rows for that version. |

### 4b. `plan_delivery_rows`

| Method | Path | Behaviour |
|--------|------|-----------|
| `POST` | `/plan_delivery_rows/bulk` | Body: `{ rows: plan_delivery_rows[] }`. Transactional multi-`db.add`. |
| `GET` | `/plan_delivery_rows` | Query: `media_plan_version` (required), `page`, `per_page`. |

### 4c. Channel / production bulk supersede

One endpoint **per table** (or one shared if Luke prefers a table-name input — per-table is clearer for allowlists):

| Method | Path | Behaviour |
|--------|------|-----------|
| `PATCH` | `/{table}/bulk_supersede` | Body: `{ ids: int[], superseded: true }`. Transactional: for each id, set `superseded`. Abort all on any miss/failure. |

`{table}` ∈ the 19 channel tables above **and** `media_plan_production`.

**Transactional pattern (fee-snapshot style):**

1. Validate auth + inputs.
2. Open / use a single function stack that loops `ids` (or rows) and applies `db.edit` / `db.add` without partial commit to the client.
3. On any error, return non-2xx; client must not assume partial success.
4. App callers soft-fail (log) when endpoint 404 until tables ship.

---

## 5. App-side identity (shipped with flags off)

| Piece | Location |
|-------|----------|
| Mint / ensure / backfill | `lib/mediaplan/lineUid.ts` |
| Types | `lib/finance/rows/types.ts` (`PlanBillingRow`, `PlanDeliveryRow`) |
| Creation | `buildDefaultLineItem`, AVA `mapperResultToFormItems`, duplicate → new uid |
| Persist | `stampLineUidsFromSources` on channel saves → `replaceChannelLineItems` |
| Defensive | MBA `PUT` ensures uids on financial line inputs before writes |
| Backfill (S2-P4) | `backfillLineUid({ mba_number, media_plan_version, line_item_id, table })` = SHA-256 hex of those four fields joined with `\0` |

---

## 6. Checklist for Luke (`.xs`)

- [ ] Create `plan_billing_rows` + unique `(media_plan_version, line_uid, month)` + indexes listed above  
- [ ] Create `plan_delivery_rows` + unique `(media_plan_version, line_uid, month)` + indexes  
- [ ] Add `line_uid`, `superseded` (default false) to 19 channel tables  
- [ ] Add `line_uid`, `superseded`, `media_plan_version` to `media_plan_production`  
- [ ] Plain indexes (not partial unique) + document tripwire ownership  
- [ ] Bulk POST + GET-by-version for both rows tables  
- [ ] `bulk_supersede` PATCH per channel/production table  
- [ ] Auth ON; Media Plans group  
