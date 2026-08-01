# ETL Xano → Supabase + Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Idempotent ETL from newest `exports/xano/<date>/` into Supabase via `db/`, plus recon that gates Phase 1 (row counts + ≤$0.01/MBA money).

**Architecture:** Two entry scripts (`etl-xano-to-supabase.ts`, `recon.ts`) plus small helpers in `scripts/migration/`. Truncate-and-reload per table family in one transaction. Transforms consolidate 20 channel tables → `line_items` and schedule blobs → `schedule_months`. Reuse `lib/billing/parsePersistedBillingScheduleToMonths.ts` + `lib/finance/accrual.ts#normalizeMonthKey` + client slug matchers — no forked money/schedule logic. No app route changes.

**Tech Stack:** tsx, drizzle-orm, postgres.js, existing `lib/**` parsers, CSV outputs under `exports/xano/<date>/recon/`.

## Global Constraints

- Fresh snapshot first (`npm run xano:export`); ETL picks newest dated folder.
- Preserve Xano integer IDs on ported + plan masters/versions (`generatedByDefaultAsIdentity` allows explicit insert).
- `UNIQUE(version_id, line_item_id)` collisions → collapse to highest Xano id, log `duplicates.csv` (never silent).
- Production lines: no `media_plan_version` → map via `mba_number` + `mp_plannumber` → versions; collapse per line identity.
- Renames: `finance_saved_views.user` → `user_id`; `clientdashboard.Client_dashboard` → `client_dashboard`.
- Drop: `xero_invoices`, `media_plan_monthly_lines`, `user`.
- Money → integer cents at final assignment only; unparseable schedule blobs → `parse-failures.csv`, never guessed `$0`.
- Exit non-zero on count mismatch or money delta > $0.01 per MBA.
- No app code changes (extract pure parse helpers only if `tsx` cannot import `lib/**`).

---

### Task 1: Shared migration helpers

**Files:**
- Create: `scripts/migration/_shared.ts`

**Produces:** `loadEnvLocal`, `newestSnapshotDir`, `readJsonl`, `writeCsv`, `toCents`, `parseMoneyStrict`, `tsFromXano`, `resolveClientId`

- [ ] **Step 1: Implement `_shared.ts`**

```ts
// loadEnvLocal (copy pattern from export-xano.ts)
// newestSnapshotDir(): scan exports/xano/*/manifest.json, pick max date folder
// readJsonl<T>(file): T[]
// writeCsv(path, headers, rows)
// toCents(dollars: number): number  // banker's round half-to-even at *100
// parseMoneyStrict(val): number | null  // null if unparseable (not 0)
// resolveClientId(name, clients[]): number | null
//   — findClientRawByDashboardSlug then mbaidentifier-slug fallback (xanoClientSlugMatch + clientGroup pattern)
```

- [ ] **Step 2: Smoke** — `npx tsx -e "import { newestSnapshotDir } from './scripts/migration/_shared'; console.log(newestSnapshotDir())"` → prints `exports/xano/2026-07-30` (or newer).

---

### Task 2: Schedule blob → `schedule_months` rows

**Files:**
- Create: `scripts/migration/_scheduleTransform.ts`

**Consumes:** `normalizeBillingScheduleToArray`, `parsePersistedBillingScheduleToMonths` from `@/lib/billing/parsePersistedBillingScheduleToMonths`; `normalizeMonthKey` from `@/lib/finance/accrual`

**Produces:** `explodeScheduleToMonthRows(versionId, basis, raw) → { rows, failureReason? }`

- [ ] **Step 1: Implement explode**
  - If raw empty/null → `{ rows: [] }` (not a parse failure).
  - If `normalizeBillingScheduleToArray` returns null on non-empty raw → failure.
  - Parse to `BillingMonth[]`; for each month + each `lineItems[mediaKey][]`:
    - media amount from `monthlyAmounts[monthYear]` or `mediaAmount`/`totalAmount` → `component='media'`
    - fee from `feeMonthlyAmounts` / `feeAmount` → `component='fee'`
    - `month` = first-of-month date from `normalizeMonthKey(monthYear)` → `YYYY-MM-01`
    - `source='computed'`, `amount_cents=toCents(...)`
  - Month-level services without line items (`adservingTechFees`, top-level `feeTotal` residual, `production` when no production line items) → synthetic `line_item_id` `__service__adserving` / `__service__fees` / `__service__production`.
  - Any month label that won't normalize, or money that won't parse → failure for whole version (disposition, no partial guess).

- [ ] **Step 2: Unit-style smoke** with a tiny fixture blob (inline in comment / optional `__tests__` later).

---

### Task 3: Channel tables → `line_items`

**Files:**
- Create: `scripts/migration/_lineItemTransform.ts`

**Consumes:** `LINE_CHANNELS`, `lineItemAttrsByChannel` from `db/schema`; `resolveLineItemBursts` from `@/lib/mediaplan/deriveBursts`

**Produces:** `buildLineItems(snapshot, versionsById, versionsByMba) → { inserts, duplicates[], productionCollapses[] }`

- [ ] **Step 1: Channel map**
  - Table `media_plan_<channel>` → enum channel (same suffix). Tables: television, radio, cinema, newspaper, magazines, ooh, prog_*, digi_*, social, search, influencers, integrations, production.
- [ ] **Step 2: Common fields** → typed columns; everything else except id/created_at/mba_number/mp_client_name/mp_plannumber/media_plan_version/line_item/bursts/bursts_json → `attrs` (zod `.passthrough()` parse for known channels).
- [ ] **Step 3: bursts** = `resolveLineItemBursts(row)` verbatim array (or null).
- [ ] **Step 4: version_id**
  - If `media_plan_version` present → that id (must exist in versions).
  - Else production only: versions where `mba_number` matches and `version_number === Number(mp_plannumber)`; if none, all MBA versions? **Spec: mba_number+mp_plannumber → that MBA's relevant versions.** Use version_number match; if no match, log collapse/skip to productionCollapses and skip insert.
  - Production may lack `line_item_id` — synthesize from mba + channel + position if missing (stable).
- [ ] **Step 5: Dedupe** group by `(versionId, lineItemId)`, keep max Xano `id`, append to `duplicates.csv` rows (version, line_item_id, kept_id, dropped_ids, dropped_budget_sum).

---

### Task 4: ETL orchestrator

**Files:**
- Create: `scripts/migration/etl-xano-to-supabase.ts`
- Modify: `package.json` — add `"db:etl": "tsx scripts/migration/etl-xano-to-supabase.ts"`

**Families (each: BEGIN → TRUNCATE listed tables → INSERT → COMMIT):**

1. **reference** — audio_site, bvod_site, display_site, video_site, tv_stations, radio_stations, newspapers, newspaper_adsizes, magazines, magazines_adsizes, media_container_best_practice, publishers, planning_audiences
2. **clients** — clients (abn int→text), then client_domains, client_notes, clientdashboard (rename Client_dashboard), client_kpi
3. **plan_core** — null cycle: truncate schedule_months, line_items, billing_overrides, mba_fee_snapshots, media_plan_versions, media_plan_masters CASCADE together; insert masters (resolve client_id); insert versions (master_id via mba_number, legacy_schedules blob, channel_flags from mp_* bools, budget cents); set published_version_id from master's version_number; line_items; schedule_months; mba_fee_snapshots; billing_overrides
4. **kpi_finance_tasks_xero** — campaign_kpi, publisher_kpi, finance_*, revenue_*, scope_of_work, creative_asset, pacing_orphan_fixes, tasks*, xero_* (not xero_invoices)

- [ ] **Step 1: Implement loaders** — snake_case JSONL → drizzle values; timestamp ms → ISO string; renames applied.
- [ ] **Step 2: Write disposition CSVs** into `exports/xano/<date>/recon/duplicates.csv` during line-item load.
- [ ] **Step 3: Run** `npx tsx scripts/migration/etl-xano-to-supabase.ts` against Supabase (needs `DATABASE_URL` in `.env.local`).

---

### Task 5: Reconciliation gate

**Files:**
- Create: `scripts/migration/recon.ts`
- Modify: `package.json` — add `"db:recon": "tsx scripts/migration/recon.ts"`

**Outputs** (under `exports/xano/<date>/recon/`):
- `recon-report.csv` — table counts + per-MBA-version money columns
- `parse-failures.csv` — version_id, mba_number, version_number, basis, reason (~68 expected)
- `schedule-divergence.csv` — version has line_items but empty schedule_months (~49 expected)
- stdout summary; **exit 1** if any ported/plan count mismatch (after known transforms) or any MBA money |delta| > 0.01

**Count rules:**
- Ported 1:1 tables: Xano fetched_count === Supabase count
- Channel tables: sum(Xano channel rows after documented collapses) vs `line_items` count (recon reports both raw and collapsed)
- Masters/versions: 1:1 on ids
- Dropped tables: not compared

**Money rules (per version):**
- `burst_budget_sum` from line_items.bursts (parseMoneyStrict on budget/cost fields)
- `schedule_media_billing_cents`, `schedule_fee_billing_cents`, delivery counterparts from schedule_months
- `legacy_billing_total_cents` / `legacy_delivery_total_cents` recomputed via same explode helper
- Fail if |schedule − legacy| > 1 cent per component/basis, or |burst vs schedule media| noted (informational if known skew — only hard-fail schedule vs legacy and table counts per pack: "money delta > $0.01 per MBA")

- [ ] **Step 1: Implement recon.ts**
- [ ] **Step 2: Run after ETL; disposition lists non-empty is OK; mismatched counts are not**

---

### Task 6: Kickoff pack / brain note (surgical)

**Files:**
- Modify: `docs/superpowers/supabase-migration-kickoff-pack-2026-07-30.md` — mark Prompt 3 DONE when green (same PR)

No `docs/brain/` update unless contracts change (they do not — scripts-only).

---

## Self-review

1. Spec coverage: channel→line_items, schedules, clients.abn, mbaidentifier client_id, recon CSVs, duplicates, idempotent truncate — covered.
2. No placeholders in task interfaces.
3. Types: `LineChannel`, cents as number mode bigint, schedule enums match `db/schema/enums.ts`.
