# Supabase migration — Phase 0–1 kickoff pack

**Date:** 2026-07-30 · **Status: Active** · **Decision:** Supabase (Sydney) + Drizzle, per the backend platform review (same date). · **Format:** Luke-does runbook first, then Cursor prompts in order. Nothing here touches production behaviour — Phase 0/1 is entirely additive (new scripts, new project, read-only credentials).

## STATUS UPDATE — 2026-07-30 evening (read before executing prompts)

- **Prompt 1 DONE** (`4252f4e3` on localhost): `scripts/migration/export-xano.ts`, smoke-run green (66 tables, counts matched), Xero logic exported to `exports/xano/2026-07-30/logic/`.
- **Supabase project EXISTS** (created by Luke): org "AssembledView", **Free plan** (upgrade to Pro deferred until Phase 2 — pausing/no-backup/nano caveats accepted while Xano remains system of record), project ref `slpdibnxtpdlttbbczvg`, AWS ap-southeast-2 (Sydney). Skip runbook A1 except the connection-string/env steps.
- **Target schema ALREADY APPLIED to the live database** (by Claude via SQL Editor): 45 tables, 96 indexes, 7 FKs, 6 unique constraints, **RLS enabled on all 45 tables with no policies** (anon/REST keys blocked by design; the app connects server-side via Drizzle over the pooled/direct connection, unaffected by RLS). Source of truth: `db/migrations/0001_ported_tables.sql` and `db/migrations/0002_plan_core.sql` in this repo.
- **Deviation from the original Part B text:** `finance_saved_views.user` is named **`user_id`** in Postgres (`user` is a reserved word). The ETL (Prompt 3) must map `user` → `user_id`. `clientdashboard.Client_dashboard` is lowercase `client_dashboard`.
- **Prompt 2 DONE** (`312f0358` + follow-up): `db/schema/*.ts` mirrors live SQL (45 tables / 588 columns); `drizzle-kit pull` via `DIRECT_URL` succeeded; column set matches authored `0001`/`0002`; `drizzle-kit generate` → empty. Do not `db:migrate` against Supabase (already applied via SQL Editor).
- **Prompt 2 method (historical):** do NOT author blind / do NOT apply an initial migration — DB was ahead of code. Author `db/schema/*.ts` to match the two SQL files; gate on empty `drizzle-kit generate` after live pull.

**Locked decisions:** Supabase Pro, region `ap-southeast-2` (Sydney) · Drizzle ORM + drizzle-kit migrations + drizzle-zod · Auth0, Vercel, Snowflake, Xero relationships unchanged · Xano remains system of record until Phase 4 · plan-family schema consolidates during migration (20 channel tables → `line_items`, blobs → `schedule_months`); finance/xero/reference tables port ~1:1 with type fixes · money stored as **integer cents** everywhere new.

---

## Part A — Luke's runbook (do these by hand, ~1–2 hours total)

### A1. Create the Supabase project (billing lands on your card — ~US$25/mo)
1. supabase.com → sign in with your GitHub (or work Google) account → New organization "Assembled Media" → **Pro plan**.
2. New project: name `assembled-view`, region **Oceania (Sydney) ap-southeast-2**, generate a strong DB password → save it in your password manager (this is the `postgres` role password).
3. Project Settings → **Compute**: leave on Micro (covered by the $10 credit). Settings → Billing → turn **spend cap ON**.
4. Settings → Database → copy both connection strings:
   - **Transaction pooler** (port 6543) → this becomes `DATABASE_URL` (what Vercel functions use)
   - **Direct connection** (port 5432) → this becomes `DIRECT_URL` (what drizzle-kit migrations use)
5. Add both to `.env.local` and to Vercel → Project → Environment Variables (all environments). Do **not** commit values.

### A2. Provision Xano's Database Connector (read-only) — first real off-platform backup path
1. app.xano.com → Instances → AssembledView → ⚙ → **Database Connector** → DETAILS → **START** provision (takes a few minutes).
2. When ready, copy the **read-only** credential set only. Store in password manager. (Do not use full-access creds anywhere.)
3. SETTINGS tab → restrict allowed IPs later if we add a fixed runner; fine to leave default for now.

### A3. Confirm the workspace storage format (2 minutes — resolves the ~85% assumption in the review)
Workspace (AssembledView – 2.0) → settings → look for **"standard SQL columns / custom table names"** migration option.
- If it's offered → we're on legacy JSONB storage → ETL goes via Metadata API as planned (no change).
- If it says already migrated → a direct `pg_dump` through the connector becomes a bonus backup path. Either way, note the answer in this doc.

### A4. Generate a Metadata API token (for the export/ETL scripts)
Instance ⚙ → Metadata API → create token, scope: read (tables, records, workspace export). Store as `XANO_METADATA_TOKEN` in `.env.local` only (NOT Vercel yet — the ETL runs from your machine). Note: a token file `xano-metadata-token.txt` already sits in the repo root from July's work — treat that one as compromised-by-convenience: regenerate rather than reuse, and delete the file when convenient.

### A5. Freeze notice (tell the team / yourself)
Until Phase 4: no schema changes in Xano without updating `docs/brain/` + this pack; `bursts_json` shape, `line_item_id` format, and the Snowflake `XANO_LINE_ITEMS_SNAPSHOT` contract are **frozen**.

---

## Part B — Target schema (Drizzle draft — Cursor Prompt 2 turns this into code)

Grounded in `xano-tables-schema.json` field analysis (30 Jul): across the 20 channel tables, these fields are common to all or all-but-production: `mba_number, mp_client_name, mp_plannumber, line_item (position), media_plan_version, line_item_id, market, buying_demo, buy_type, fixed_cost_media, client_pays_for_media, budget_includes_fees, no_adserving (15/20), bursts_json (17/20; named `bursts` in cinema/radio/production)`. Channel-specific tail (station, network, site, platform, placement, format, size, duration, daypart, objective, campaign, creative, creative_targeting, bid_strategy, title, type, description…) → one `attrs jsonb` validated per-channel with zod.

### Plan family (the consolidation)

```
clients            — ported from Xano `clients`, with fixes: abn TEXT (currently int), keep fee% columns for now
publishers         — ported 1:1; `best_practice` stays jsonb
media_plan_masters — id, mba_number UNIQUE, client_id FK→clients, campaign fields,
                     published_version_id FK→media_plan_versions (nullable, the publish pointer)
media_plan_versions— id, master_id FK, version_number, campaign/brand/PO fields, budget_cents,
                     fixed_fee_cents, status, created_by, UNIQUE(master_id, version_number)
                     -- billingSchedule / deliverySchedule blobs DO NOT COME OVER as authority;
                     -- they are parsed into schedule_months. Keep a `legacy_schedules jsonb`
                     -- copy for audit during migration only.
line_items         — id, version_id FK→versions ON DELETE CASCADE,
                     channel line_channel_enum (television|radio|cinema|newspaper|magazines|ooh|
                       prog_display|prog_video|prog_audio|prog_bvod|prog_ooh|digi_display|digi_video|
                       digi_audio|digi_bvod|social|search|influencers|integrations|production),
                     line_item_id text NOT NULL, position int,
                     market, buying_demo, buy_type, publisher, platform, bid_strategy (nullable text),
                     fixed_cost_media bool, client_pays_for_media bool, budget_includes_fees bool,
                     no_adserving bool,
                     bursts jsonb,          -- frozen contract shape, verbatim from bursts_json
                     attrs jsonb,           -- channel-specific tail, zod-validated per channel
                     UNIQUE(version_id, line_item_id)   ← kills the PENFOLD016 class
schedule_months    — id, version_id FK, line_item_id text, component ('media'|'fee'),
                     basis ('billing'|'delivery'), month date (first-of-month), amount_cents bigint,
                     source ('computed'|'override'), UNIQUE(version_id, line_item_id, component, basis, month)
mba_fee_snapshots  — version_id FK UNIQUE, fees jsonb (per-media %, adserving rates), captured_at
billing_overrides  — ported to rows against schedule_months semantics (version_id, line_item_id,
                     component, months jsonb → later folded into schedule_months.source='override')
```

Notes: `media_plan_production`'s version-less append-forever design dies here — production lines become ordinary `line_items` rows with `channel='production'` and a real `version_id` (backfill maps via mba_number + mp_plannumber, taking latest per line identity; the known 220-rows-for-1-line cases collapse).

### Ported ~1:1 (type fixes only)
`campaign_kpi, client_kpi, publisher_kpi, finance_billing_records (+billed_amount_cents, billed_lines_hash as real columns), finance_billing_line_items, finance_edits, finance_saved_views, revenue_forecast_lines, revenue_line_catalog, scope_of_work, creative_asset, planning_audiences, pacing_orphan_fixes, tasks family, client_notes/domains, clientdashboard, reference tables (tv/radio stations, newspapers+adsizes, magazines+adsizes, *_site, media_container_best_practice)`.
**Dropped (do not migrate):** `xero_invoices` (empty legacy), `media_plan_monthly_lines` (superseded by schedule_months), `user` (Auth0 is identity).
**Xero tables** (`xero_ar_invoices, xero_ap_bills, xero_contacts, xero_sync_exceptions, xero_sync_log`) port 1:1 in Phase 1 as data; their *writer* (the Xano sync task) is rebuilt in Phase 3.

Result: ~66 → ~35 tables.

---

## Part C — Cursor prompts (run in order; each is one PR to `localhost`)

### Prompt 1 — Xano export snapshot script (backup + ETL source)
> Create `scripts/migration/export-xano.ts` (tsx, no new deps beyond what's installed; use axios). It reads `XANO_METADATA_TOKEN` and the instance base `https://xg4h-uyzs-dtex.a2.xano.io` from env. Using the Xano Metadata API: enumerate all workspace tables, then page through every table's records (respect pagination; per_page 100; retry with backoff on 429/5xx) and write one JSON-lines file per table to `exports/xano/<YYYY-MM-DD>/<table>.jsonl`, plus a `manifest.json` with row counts and a schema snapshot per table. Exit non-zero if any table's fetched count ≠ the count reported by the API. Add `npm run xano:export`. Add `exports/` to .gitignore. Also fetch the workspace's function/task definitions (XanoScript export endpoints of the Metadata API) into `exports/xano/<date>/logic/` — we need the Xero sync task source for Phase 3 planning. Do not touch any existing app code.

### Prompt 2 — Drizzle setup + target schema + local dev DB
> Add drizzle-orm, drizzle-kit, drizzle-zod, postgres (postgres.js driver) as deps. Create `db/schema/` implementing the target schema exactly as specified in `docs/superpowers/supabase-migration-kickoff-pack-2026-07-30.md` Part B (this file will be added to the repo — Status: Active). Conventions: integer cents (bigint) for all money; timestamptz; snake_case; every FK explicit with onDelete; the two UNIQUE constraints called out are mandatory. Create `db/index.ts` exporting a client that uses `DATABASE_URL` (pooled) at runtime and `DIRECT_URL` for migrations; `drizzle.config.ts`; `npm run db:generate`, `db:migrate`, `db:studio`. Generate the initial migration and apply it to the Supabase project. Add per-channel zod validators for `line_items.attrs` in `db/schema/lineItemAttrs.ts` — one zod object per channel covering the channel-specific fields listed in the pack, `.passthrough()` for unknown keys (legacy tolerance). No app route may import `db/` yet — this PR is schema-only. Tests: `tsx --test` golden test that every channel enum value has an attrs validator.

### Prompt 3 — ETL + reconciliation (the gate for everything after)
> Create `scripts/migration/etl-xano-to-supabase.ts`: reads the newest `exports/xano/<date>/` snapshot and loads Supabase via `db/`. Idempotent: full truncate-and-reload of migrated tables inside one transaction per table family. Transforms: (1) 20 `media_plan_<channel>` tables → `line_items` (channel from table name; common fields typed; tail fields → attrs; `bursts`/`bursts_json` → `bursts` verbatim; resolve version_id via media_plan_version where present, else — production only — map via mba_number+mp_plannumber to that MBA's relevant versions, collapsing duplicate line identities to the latest row and logging every collapse). (2) `media_plan_versions.billingSchedule/deliverySchedule` → `schedule_months` rows using the existing parser modules (`lib/**` — reuse, do not reimplement; import the same normalisation used by finance), amounts to cents; keep raw blobs in `legacy_schedules`. (3) clients.abn int→text; name-keyed references resolved to client_id with the existing mbaidentifier fallback logic. Then `scripts/migration/recon.ts`: per table row counts Xano-vs-Supabase, and per MBA per version: line-item count, sum of burst budgets, sum of schedule_months by component/basis vs the app's own computed totals — output `recon-report.csv` + a summary that exits non-zero on any count mismatch or money delta > $0.01 per MBA. Produce `parse-failures.csv` for every version whose blobs won't parse (expect ~68) and `schedule-divergence.csv` for versions with line items but empty schedules (expect ~49) — these are dispositioned by hand, not silently skipped. No app code changes.

### Prompt 4 — first shadow-read domain (reference tables)
> Behind the existing choke point (`lib/api/xano.ts` callers for media-details reference data: tv_stations, radio_stations, newspapers(+adsizes), magazines(+adsizes), audio/bvod/display/video_site), add a `DATA_BACKEND=xano|shadow|postgres` env switch (default `xano`). In `shadow`, serve from Xano but also query Supabase and log field-level diffs (no user impact); in `postgres`, serve from Supabase. Wire only the reference-table routes in this PR. Add a `/api/admin/migration-diffs` admin-only route summarising shadow diffs from the last 24h (in-memory or log-based is fine). Respect existing tenant-check patterns — new routes must implement their own auth per CLAUDE.md.

**Order of later domains (Phase 2, one PR each): publishers/clients → KPI tables → finance → pacing → media plans.** Then Phase 3 (transactional writes) gets its own pack once the Xero sync XanoScript from Prompt 1 has been read.

---

## Part D — Exit gates (from the review; unchanged)
- **Phase 0 done when:** Supabase project live (Sydney), read-only connector provisioned, `npm run xano:export` produces a snapshot whose manifest counts match the live dashboard (28,585 ± drift), storage-format question answered, Xero sync XanoScript exported and skimmed.
- **Phase 1 done when:** recon = 100% row counts, ≤ $0.01/MBA money deltas, and the 68/49 anomaly lists each have a disposition (fix / exclude / accept-as-is).

## Open items tracked
1. Actual Xano invoice owner/amount — confirm before Phase 4 cancellation planning.
2. Supabase PITR add-on (US$100/mo) — decide at Phase 3 (when writes move); daily 7-day backups are included meanwhile.
3. Team walkthrough of Supabase Studio (replaces Xano data editor) — schedule during Phase 2.
