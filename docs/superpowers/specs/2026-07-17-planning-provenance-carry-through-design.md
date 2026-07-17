# Planning BCS provenance + Stage E → create carry-through — design

**Date:** 2026-07-17  
**Status:** Approved (Approach 1 + carry-through C + mapping M1; 2026-07-17 amendments)  
**Branch context:** `remediation-p0-p1`  
**Scope:** `lib/planning`, `app/tools/behavioural-planner`, `app/api/planning`, Stage E → `/mediaplans/create` handoff

## Goal

1. **Provenance** — Stop presenting attention / brand-effect / direct-effect / CPM benchmarks as Roy Morgan. Ship a named client `PLANNING_CHANNEL_BENCH` with per-pillar `{ value, source }`, tag pillars correctly using `IS_RM_MEASURED` + module sources, and show the same RM-vs-benchmark split in Stage E UI and the exported deck.
2. **Carry-through** — Close the Stage E “Start campaign” dead-end by persisting a **frozen** recommended channel split on the saved audience and prefilling create via **`audienceId` only** (server-side load, tenant-guarded). Map to **channel-level budget targets** — enable media containers + seed spend — **never fabricate line items**.

## Non-goals

- Changing BCS weights, affinity vs incremental-reach scoring, or DFII math (doctrine: **surface** for human sign-off only).
- A second attach-on-create path (reuse Stage E / MBA attach list already shipped).
- Blocking ship on warehouse `SOURCE` columns.
- Persisting invented rates, publishers, buy types, or MEDIA_* rows from the planner.

---

## Front and centre: trust rules for carry-through

These three rules decide whether create is trustworthy or drifts. Implement them first in the plan; everything else hangs off them.

### Rule 1 — Total, explicit `engineChannelId → mp_*` map

Every planner engine id that can appear in a frozen split **must** resolve to exactly one create media toggle (`mp_*`). Engines with no natural container go to a visible **unmapped / other** bucket — **never silently dropped**.

Invariant after aggregation:

```
sum(channel target $) === mp_campaignbudget
```

If any dollars land in unmapped, the create UI must show an “Unmapped from planner” note with the dollar total so the strip cannot lie.

#### Proposed map (review before code)

| `engineChannelId` | Create toggle | Notes |
|-------------------|---------------|--------|
| `tv` | `mp_television` | |
| `paytv` | `mp_television` | Coarse bucket |
| `bvod` | `mp_bvod` | |
| `svod` | `mp_bvod` | Closest owned-video container; revisit if product prefers `mp_digivideo` |
| `youtube` | `mp_digivideo` | Not BVOD buy path |
| `radio` | `mp_radio` | |
| `streaming` | `mp_digiaudio` | Music streaming |
| `podcasts` | `mp_digiaudio` | |
| `news_print` | `mp_newspaper` | |
| `news_digital` | `mp_digidisplay` | |
| `mags_print` | `mp_magazines` | |
| `mags_digital` | `mp_digidisplay` | |
| `ooh_street` | `mp_ooh` | |
| `ooh_billboard` | `mp_ooh` | |
| `ooh_shopping` | `mp_ooh` | |
| `ooh_transit` | `mp_ooh` | |
| `facebook` | `mp_socialmedia` | |
| `instagram` | `mp_socialmedia` | |
| `digital_other` | `__unmapped__` | Catch-all must not assert an inventory type the planner never chose; planner-user places these dollars consciously |
| `search` | `mp_search` | Injected Search row |
| `cinema` | `mp_cinema` | |

**Unmapped residual:** any future / unexpected `engineChannelId` → synthetic bucket key `__unmapped__` (not an `mp_*` toggle). Dollars still count toward `mp_campaignbudget`; strip lists them under “Unmapped from planner”. Unit test: map is total over `Object.keys(PLANNING_CHANNEL_BENCH)` (+ `search`).

Join key already exists: meta query selects `c.ENGINE_CHANNEL_ID` (`lib/planning/queries.ts`). Adapter already scores on that id.

### Rule 2 — Rounding / residual policy (money module)

Planner `allocate` today rounds dollars to the nearest `$1,000` (`Math.round(…/1000)*1000`), which can leave `sum(dollars) ≠ budget`. Carry-through must not inherit that as create truth.

On freeze (Stage E save) and again on create aggregation into `mp_*` buckets:

1. Convert engine-level dollars with **`roundMoney2`** (`lib/format/money.ts`) — same policy as budgets / media.
2. Sum per `mp_*` bucket with `roundMoney2` on each bucket total.
3. **Residual:** `mp_campaignbudget − sum(bucket targets)`. Apply residual to the **largest mapped** bucket by absolute dollars (skip `__unmapped__` as the residual sink — a rounding artifact must not pool into “unmapped”). If ties among mapped buckets, prefer first in stable `mp_*` display order. Snapshot stays reproducible.
4. Percentages on the strip are derived from the reconciled dollar targets (`roundMoney2` / budget × 100), not re-taken from planner `%` after collapse (collapse would reintroduce drift).

**Scale note:** Planner `allocate` pre-rounds dollars to the nearest `$1,000`, so residual can be ~$1,000-scale, not just cents. The largest mapped bucket’s strip figure may therefore differ from the planner’s displayed engine-channel dollars by up to a grand. That is expected: **budget is authoritative**; `%` is re-derived from reconciled dollars (step 4).

Same residual policy when collapsing fine engines into coarse `mp_*` (e.g. facebook + instagram → `mp_socialmedia`).

### Rule 3 — Channel budget targets only — no fabricated line items

Carry-through enables:

- Media-type toggles (`mp_*` = true for buckets with target $ > 0)
- `mp_campaignbudget` = reconciled sum
- Flight dates / campaign name / client from brief + audience (existing identity fields)
- A visible **“From planner”** target strip: one row per enabled `mp_*` (+ unmapped if any) showing target $ and %

Carry-through **must not**:

- Insert MEDIA_* / container line rows
- Invent rates, CPMs, publishers, buy types, bursts, or quantities
- Re-run BCS or re-derive the split from live benches at create time

Planner fills strategy; planner-user fills line-item detail. Pacing, finance, and atomic-save keep trusting only real lines.

---

## Workstream A — Provenance

### A.1 Client `PLANNING_CHANNEL_BENCH` module

Replace / evolve `lib/planning/benchmarkDefaults.ts` into a named module (e.g. `lib/planning/planningChannelBench.ts`) exporting:

```ts
type BenchPillar = { value: number; source: string }

type PlanningChannelBenchRow = {
  name: string
  color: string // existing token CSS var strings only
  attn: BenchPillar
  brand_effect: BenchPillar  // engine B
  direct_effect: BenchPillar // engine D
  cpm: BenchPillar
}

export const PLANNING_CHANNEL_BENCH: Record<string, PlanningChannelBenchRow>
export const PLANNING_CHANNEL_BENCH_VERSION = "assembled-seed-v1" // freeze stamp
```

- Seed values = today’s `BENCHMARK_DEFAULTS` numeric values.
- Default `source` string until warehouse per-pillar sources exist:  
  **`Assembled seed — pending warehouse source`**
- Keep `SEARCH_ENGINE_CHANNEL_ID = "search"`.
- Adapter `resolveBench` reads `{ value, source }` (warehouse numeric override still wins for **value** when meta returns non-null ATTN/B/D/CPM; **source** from meta when present, else module source).

### A.2 Pillar tagging (ship without warehouse SOURCE)

| Pillar | Tag | Rule |
|--------|-----|------|
| **A** (affinity) | `rm` \| `benchmark` | `rm` **only** when `c.IS_RM_MEASURED` / `isRmMeasured === true`; else benchmark (Search / non-RM) |
| **T** (attention) | `benchmark` | Always — from bench attn |
| **E** (effect B/D) | `benchmark` | Always |
| **C** (cost / CPM) | `benchmark` | Always |

**Label wording:** An `rm` tag means **“this pillar is RM-sourced”**, not “RM materially moved this ranking.” For base / All People audiences, Roy Morgan often contributes little to relative ranking — copy must denote **provenance, not influence** (e.g. “Source: Roy Morgan” / “Source: benchmark”, never “RM-driven”).

Do **not** wait on `b.SOURCE`. Existing channel-level “Benchmark-based — not Roy Morgan” badges stay for non-RM channels; **add** per-pillar RM-vs-bench presentation on scored rows / mix / deck.

### A.3 Warehouse `SOURCE` — non-blocking + grain flag

Today (`lib/planning/queries.ts`): LEFT JOIN `PLANNING_CHANNEL_BENCH` selects `ATTN`, `BRAND_EFFECT`, `DIRECT_EFFECT`, `CPM` only — **no** source column(s).

**Probe (optional, 10s):** add `b.SOURCE` to SELECT once; if Snowflake errors unknown column → keep client fallback until P7-8. If it exists, treat as **legacy single column** only — do **not** wire one `SOURCE` into four pillars (would destroy per-pillar provenance).

**P7-8 schema agreement (flag now):** warehouse grain must match the client module:

```
ATTN_SOURCE, BRAND_EFFECT_SOURCE, DIRECT_EFFECT_SOURCE, CPM_SOURCE
```

(plus optional shared `UPDATED_BY` / `UPDATED_AT`). Blueprint today shows a single `source` — update P7-8 / blueprint follow-up to per-pillar sources before seeding admin.

### A.4 UI + deck

- Stage E / mix / results: per-pillar provenance (A = RM when measured; T/E/C = benchmark + source label).
- Export deck (`buildPlannerDeck` / ExportDeckButton): same split and version stamp — never attribute T/E/C to Roy Morgan.
- Version stamp `PLANNING_CHANNEL_BENCH_VERSION` (and later warehouse param version if present) is what freezes onto the audience.

### A.5 Doctrine comment (no scoring change)

Near `computeBcs` affinity (A) usage, add a short team comment:

> Affinity over-indexing vs incremental reach is an open product decision. Surface for human sign-off; do **not** silently change BCS weights.

---

## Workstream B — Carry-through (Approach C + M1)

### B.1 Handoff = `audienceId` only (for plan data)

- **Do not** put split / budget / % in query params (logged, shareable, tamperable; bypasses tenant checkpoint).
- Navigate: `/mediaplans/create?audienceId=<id>` (may still include existing lightweight identity params `clientId` / `campaignName` / `start` / `end` as fail-open helpers; **authoritative** split + budget targets come only from the audience row).
- Create loads audience via existing auth’d `planning_audiences` path (inherits P0-3 tenant guard). Client cannot hydrate create from another tenant’s audience.

### B.2 Persist a frozen snapshot on save

On “Use audience →” / **before** “Start campaign”, upsert `definition_json` with (additive fields; keep existing definition shape):

```ts
recommended_split: {
  version: 1
  frozen_at: string // ISO
  bench_version: string // PLANNING_CHANNEL_BENCH_VERSION (+ warehouse stamp when available)
  engine_params_version?: string // if engine params are versioned
  budget: number // brief budget used for allocate
  channels: Array<{
    engine_channel_id: string
    pct: number      // engine-level, as shown at freeze
    dollars: number  // engine-level dollars at freeze (pre-mp aggregation OK)
  }>
  // Optional precomputed create view (recommended to freeze after Rule 2):
  create_targets: Array<{
    mp_key: string // e.g. "mp_socialmedia" | "__unmapped__"
    dollars: number
    pct: number
  }>
  campaign_budget: number // === sum(create_targets.dollars)
}
```

Create maps **`create_targets` verbatim** when present; otherwise aggregates `channels` with Rules 1–2 (never re-runs BCS / never re-reads live benches for the split).

### B.3 “Start campaign” flow

1. Ensure audience is saved/updated (same path as “Use audience →”) so `audienceId` always exists.
2. Write/refresh frozen snapshot from current Stage E allocation + bench version.
3. `router.push` with `audienceId`.
4. Fail-open: if save fails, do not navigate with a stale id; toast and stay.

### B.4 Create page behaviour (M1)

| Condition | Behaviour |
|-----------|-----------|
| No `audienceId` | Today’s manual create (unchanged) |
| Audience missing / forbidden / no `recommended_split` | Fail-open to manual; optional toast “Planner split unavailable” |
| Snapshot present | Enable `mp_*` for targets > 0; set `mp_campaignbudget`; show **From planner** strip; apply identity prefill from audience/brief |
| Frozen `mp_key` missing from current create container set (renamed/removed since freeze) | Treat as `__unmapped__` under “Unmapped from planner” — **never** silently enable a dead toggle or drop the dollars (keeps `sum === mp_campaignbudget` honest across schema changes) |

Strip is the difference between a trustworthy carry-through and one that silently drops the split — required, not optional.

Reuse Stage E attach list for MBA attach; do not invent attach-on-create.

### B.5 Prefill helpers

Extend `lib/mediaplan/createPrefill.ts`:

- `buildCreateCampaignHref` accepts `audienceId` (primary).
- Keep parsing helpers for legacy identity params.
- Add pure `mapEngineSplitToCreateTargets(split, map)` implementing Rules 1–2 (unit-tested).

---

## Architecture sketch

```
Stage E allocate (BCS)
        │
        ▼
Save audience ──► definition_json.recommended_split
                  (frozen channels + create_targets + bench_version)
        │
        ▼
Start campaign ──► /mediaplans/create?audienceId=
        │
        ▼
Server/client load planning_audiences (auth + tenant)
        │
        ▼
Map snapshot → mp_* toggles + mp_campaignbudget + "From planner" strip
        │
        ▼
User fills real line items (no invented MEDIA rows)
```

Provenance stamp on the deck === `bench_version` frozen on the audience.

---

## Verification

- [ ] Mix / results / deck show A as RM only when `isRmMeasured`; T/E/C labelled benchmark with source string.
- [ ] Deck never attributes attn/B/D/cpm to Roy Morgan.
- [ ] “Start campaign” always has an `audienceId` after save; create shows From planner strip matching Stage E totals (after Rule 2 reconcile).
- [ ] `sum(strip targets) === mp_campaignbudget` (property test / unit test).
- [ ] Unknown engine id appears under Unmapped — not dropped.
- [ ] No MEDIA line rows created by handoff.
- [ ] Create without `audienceId` still works as today.
- [ ] Cross-tenant `audienceId` does not hydrate (auth/tenant guard).

## Out of scope / follow-ups

- P7-8 admin UI for benches.
- Migrating blueprint + Snowflake to `ATTN_SOURCE` / … columns.
- Changing BCS to reward incremental reach (sign-off only in this PR).

## Decisions locked

| Decision | Choice |
|----------|--------|
| Provenance approach | **1** — structured client bench + per-pillar UI/deck (reject UI-only) |
| Mapping | **M1** — aggregate to `mp_*` + visible From planner strip |
| Handoff | **`audienceId`** + server-side audience load (not split query params) |
| Split persistence | **Frozen snapshot** + bench version (not recompute on create) |
| Granularity | **Channel budget targets** only — no fabricated line items |
| Warehouse SOURCE | Non-blocking; client fallback now; **per-pillar** columns when seeded |
| A-pillar tag | Driven by **`IS_RM_MEASURED`** |
| Doctrine | Comment only — no silent weight change |

## Review amendments (2026-07-17)

- `digital_other` → `__unmapped__` (not `mp_progdisplay`).
- Residual → largest **mapped** bucket; skip `__unmapped__` as sink; tie-break = first in stable `mp_*` order.
- Freeze `create_targets` at save (confirmed); fallback aggregate when absent.
- B.4: stale/missing `mp_key` → Unmapped (never dead toggle / never drop $).
- A-pillar copy = provenance, not influence.
