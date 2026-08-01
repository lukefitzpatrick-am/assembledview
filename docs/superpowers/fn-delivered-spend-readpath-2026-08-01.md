# FN — Delivered spend read-path gate (Investment cut)

Status: **STOP — no sane section read path; do not implement `delivered_cents` yet**

Depends on: FN0 finding **6c / §E** (Delivered spend). Related: P-1, P-2, P-7; ZERO-$ LAW (ad-serving).

## STEP 1 — Where delivered spend lives

### Source of truth

**Snowflake MART facts**, not Postgres and not `schedule_months`.

| Channel family | Table(s) | Spend metric |
|---|---|---|
| Search | `ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT` | `AMOUNT_SPENT` |
| Social (Meta/TikTok) | `ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT` | `AMOUNT_SPENT` |
| Programmatic / ad-serving | `ASSEMBLEDVIEW.MART.PACING_FACT` | `AMOUNT_SPENT` (ad-serving **must not** drive spend pacing UI — ZERO-$ LAW) |
| Direct (TV/Radio/Print…) | `FIXED_COST_LINE_ITEM_FACT` + `FIXED_COST_BURST_FACT` + `FIXED_COST_REPORTED_DAILY_FACT` | reported $ (composer-shaped) |

Plan join key: `line_item_id` lowercased+trimmed. Warehouse plan snapshot: `MART.XANO_LINE_ITEMS_SNAPSHOT` (Xano-fed cron until T6) — **not** a delivered-money table.

**Do not confuse with** `dashboardMonthlySpend` / Costs delivery booked — those are **planned** `schedule_months` (`basis=delivery`), not Snowflake actuals (FN0 §E; `lib/data/dashboardMonthlySpend.ts`).

### App read paths today

1. **Pacing routes / composers** (`app/api/pacing/*`, `lib/pacing/*/fetch*Rows.ts`, Overview `buildOverviewPayload`) — live campaigns, as-of Melbourne date, line (+ current burst) grain. Cache: 4h `unstable_cache` (P-1). Cold path = full master/version crawl × channel (P-2).
2. **Snowflake helpers** — `queryPacingFact` / `getCampaignPacingData` / search pacing: **require `lineItemIds`**, **180-day clamp**, **50k row limit**, per-channel table (`lib/snowflake/pacing-fact.ts`, `pacing-service.ts`).
3. **Dashboard “Delivered”** — `loadDeliverySnapshot` (per-MBA digital via pacing-service stacks) + `fetchDirectPacingRows` (fixed-cost); client tile via `getDeliveredTotalsForClient` (**to-date**, not ×month; **bypasses** pacing cache — P-7).

There is **no** finance-style `client|channel|publisher × month` delivered aggregate helper or section endpoint.

### Grain & keys (warehouse)

- Fact grain: **`LINE_ITEM_ID` + `DATE_DAY`** (+ channel / platform).
- App pacing grain: **line (+ burst) as-of date**, not a month cube.
- **Publisher is not on the facts** — publisher/channelGroup for Investment dims require joining plan lines (FN0 accessor / `PUBLISHER_IDENTITY_SQL`), same as booked cut.
- **Client** requires join line → MBA → client (plan masters / snapshot).

### Can it serve client / channel / publisher × month server-side?

| Aggregate | Feasible on paper? | Existing path? | Fit for Investment cut? |
|---|---|---|---|
| Line × day | Yes (facts) | Yes (`queryPacingFact` etc., ID-scoped) | Too fine; not a cut measure |
| Line × month | `DATE_TRUNC` over facts | **No helper** | Still needs ID list + multi-table union |
| Channel × month | Partial (fact `CHANNEL`) | **No** | Incomplete: search/direct/social split; ad-serving spend forbidden |
| Client × month | Join facts → plan | **No** | Not implemented; would be new Snowflake SQL + plan join |
| Publisher × month | Join facts → plan publisher identity | **No** | Same; never invent publisher from invoice/fact alone |

**Closest existing aggregate:** client **lifetime to-date** (`getDeliveredTotalsForClient`) — wrong grain for FY month cuts.

### Freshness

- Warehouse daily DAG: `TSK_ROOT_DAILY_REFRESH` **CRON 06:30 Australia/Melbourne** (`sql/snowflake/mart/README.md`).
- Product copy (dashboard Delivered tiles): **`As of {date} · refreshes ~6:30am (Melbourne)`** (`HeroKPIBar`, `CampaignSummaryRow`; mirrored in `getDeliveredTotalsForClient` JSDoc).
- Pacing UI additionally shows **As of** date; app cache can lag warehouse by up to **4h** (P-1). Dashboard delivered path is cache-bypassed (P-7) so it can disagree mid-TTL with `/pacing/*`.

Any Investment surface that showed delivered would need an explicit **“Delivered as of \<date\>”** caption — but that alone does not make the read path viable.

### Cost of querying from a section endpoint

| Approach | Cost / risk |
|---|---|
| Fan-out pacing composers / Overview pattern for FY scope | Full master+version crawls (~6× cold), 5 Snowflake stacks, 45–60s budgets, 4h cache semantics — **unsuitable** for cut API (admin FY × all clients). |
| `getDeliveredTotalsForClient` / `loadDeliverySnapshot` per MBA | Per-campaign digital Snowflake + optional whole-table fixed-cost read; **to-date only**; P-7 cost; no month/publisher dims. |
| Raw `queryPacingFact` / `getCampaignPacingData` | Needs **all line IDs in scope first** (Postgres/Xano crawl), then multi-channel queries; **180-day clamp** breaks FY-to-date; 50k LIMIT truncates silently unless window-split; serverless Snowflake $ + latency. |
| New ad-hoc Snowflake month rollup in the cut route | Possible in warehouse, but **new infra / dual-stack semantics** (pacing vs bulk clamps), publisher join still required, ad-serving/zero-$ policy, maxDuration — **not “reuse existing path”**. |

**Verdict:** the only *existing* app paths are **ID-scoped Snowflake day facts** or **per-MBA / per-line pacing composers**. Neither is a sane Investment-section aggregate for booked-style dims. **STOP — do not add `delivered_cents` / `delivered_vs_booked_delta_cents` in Cursor until a month rollup exists.**

## STEP 2 — Not implemented

No API/UI changes. Grain/freshness evidence does not support a refuse-don't-prorate cut measure yet (there is nothing honest to refuse against except “entire measure unavailable”).

## Proposed alternative (for Luke / Claude — not Cursor)

Nightly **`delivered_months`** rollup (Postgres), built after the 06:30 Melbourne Snowflake refresh, at a grain the Investment cut can join without prorating:

Suggested grain: **`mba_number × line_item_id × activity_month`** (or at least **`mba_number × activity_month`** if publisher/channel dims are deferred), with denormalized dims stamped at ETL time from published tip / snapshot so section SQL stays Postgres-only.

### DDL sketch (proposal only)

```sql
-- Proposal: nightly delivered_months (not applied by this task)
CREATE TABLE IF NOT EXISTS delivered_months (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Keys
  mba_number text NOT NULL,
  line_item_id text NOT NULL,          -- cleaned lower/trim pacing id
  activity_month date NOT NULL,         -- month start (YYYY-MM-01)
  -- Stamped dims (from plan tip / XANO_LINE_ITEMS_SNAPSHOT at ETL)
  client_id bigint NULL,
  channel text NULL,                   -- line_channel / pacing channel bucket
  channel_group text NULL,             -- Investment curated group if desired
  publisher text NULL,                 -- FN0 identity label; null → Unmatched at read
  -- Measures (cents)
  delivered_cents bigint NOT NULL DEFAULT 0,
  -- Freshness
  as_of_date date NOT NULL,            -- Melbourne as-of used for the batch
  source text NOT NULL,                -- e.g. search|social|programmatic|direct
  CONSTRAINT uq_delivered_months_grain
    UNIQUE (mba_number, line_item_id, activity_month, source)
);

CREATE INDEX IF NOT EXISTS idx_delivered_months_client_month
  ON delivered_months (client_id, activity_month);
CREATE INDEX IF NOT EXISTS idx_delivered_months_month
  ON delivered_months (activity_month);
```

**Batch rules (sketch):** union spend-eligible Snowflake facts (exclude ad-serving spend); month-bucket `AMOUNT_SPENT` / fixed-cost reported; stamp dims from published tip; set `as_of_date`; idempotent upsert. Investment cut then reads Postgres like booked/AR Actuals, with freshness caption from `max(as_of_date)`.

**Grain policy once table exists:** allow dims whose keys are stamped on the rollup; refuse dims not stamped (same honesty pattern as FN5c Actuals) — never prorate delivered across publishers.

## Grain matrix (today — all BLOCKED for cut)

| Dim | delivered_cents |
|---|---|
| client / month / fy / channel / publisher / … | **BLOCKED** — no section read path |

## Probes / evidence cites

- FN0 §E: agent report (Delivered spend) — line+day facts; no client×month route
- `docs/brain/modules/pacing.md` — tables, cache, dual stacks
- `lib/snowflake/pacing-fact.ts` — ID list, 180d, 50k
- `lib/delivery/getDeliveredTotalsForClient.ts` — to-date + ~06:30 note
- `sql/snowflake/mart/README.md` — `TSK_ROOT_DAILY_REFRESH` 06:30 Melbourne
- `components/dashboard/HeroKPIBar.tsx` — UI freshness string
