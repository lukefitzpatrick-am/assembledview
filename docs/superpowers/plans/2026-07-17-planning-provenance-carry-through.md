# Planning provenance + Stage E → create carry-through — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship named per-pillar `PLANNING_CHANNEL_BENCH` provenance (UI + deck) and close the Stage E “Start campaign” dead-end via `audienceId` + frozen `create_targets` mapped to create media toggles and a visible “From planner” strip — no fabricated line items.

**Architecture:** (1) Replace `benchmarkDefaults` with `PLANNING_CHANNEL_BENCH` (`{ value, source }` per pillar + version stamp); migrate the **single** consumer (`adapter.ts`) in the same task — **no aliasing shim**. (2) Tag A via `isRmMeasured`; T/E/C always benchmark; copy denotes provenance not influence. (3) Pure `mapEngineSplitToCreateTargets` owns the total `engineChannelId → mp_*` map and Rule 2 residual reconciliation (signed residual, clamp ≥ 0). (4) Freeze snapshot onto existing freeform `definition_json` on save (**no Xano schema / migration**); create loads `/api/planning/audiences/[id]` and applies targets fail-open.

**Tech Stack:** Next.js App Router, existing `tsx --test` node:test suites under `lib/**/__tests__`, `roundMoney2` from `lib/format/money.ts`, Xano `planning_audiences` via existing API routes.

**Spec:** `docs/superpowers/specs/2026-07-17-planning-provenance-carry-through-design.md` (approved)

### Plan review amendments (2026-07-17)

1. **No `BENCHMARK_DEFAULTS` alias shim** — `BENCHMARK_DEFAULTS` is consumed only in `adapter.ts` (≈L230, L286) via `resolveBench`. Aliasing the nested `{value,source}` shape under the old name would feed objects into flat-number reads → silent `NaN` through BCS. Task 1 migrates `resolveBench` + those two call sites to `.value` and removes the flat export.
2. **Stale-key guard must not be tautological** — `knownCreateKeys` at hydrate comes from the **real create form** media-toggle field names, not from `MP_KEY_ORDER` alone. Add a test that `MP_KEY_ORDER` exactly equals the create form’s media-type toggle set (exclude `mp_production` / `mp_fixedfee`).
3. **Negative residual clamp** — residual can be negative (planner ~$1k pre-round). Apply to largest mapped bucket, but never drive any bucket below zero; spill remaining deficit to next-largest mapped (then unmapped only if no mapped left). Pin with a unit test.

## Global Constraints

- Handoff plan data via **`audienceId` only** — never put split/$/% in query params.
- Freeze **`create_targets` + `bench_version`** at save; create maps snapshot verbatim (fallback aggregate only if `create_targets` absent).
- **`recommended_split` lives in existing freeform `definition_json`** — **no Xano schema change / migration**. Do not add one reflexively.
- **No fabricated MEDIA / line items** — toggles + `mp_campaignbudget` + strip only.
- Residual → **largest mapped** bucket; never `__unmapped__` as residual sink; tie-break = first in stable `mp_*` order; **clamp buckets ≥ 0** under negative residual.
- `digital_other` → `__unmapped__` (not `mp_progdisplay`).
- Stale/missing `mp_key` → `__unmapped__` (never enable a dead toggle; never drop $). Hydrate `knownCreateKeys` from **form field names**.
- A-pillar label = **source provenance**, not “RM-driven / influence”.
- Doctrine: comment only near `computeBcs` A — **no weight changes**.
- Design tokens only in any new UI (no raw hex / palette colours).
- Fail-open create when no `audienceId` / no split.
- **No aliasing shim** of nested bench under `BENCHMARK_DEFAULTS`.

---

## File map

| Path | Role |
|------|------|
| `lib/planning/planningChannelBench.ts` | **Create** — named bench table + `PLANNING_CHANNEL_BENCH_VERSION` + seed sources |
| `lib/planning/benchmarkDefaults.ts` | **Delete** after Task 1 migrates imports (or leave a file that only re-exports `SEARCH_ENGINE_CHANNEL_ID` / version — **never** re-export nested rows as `BENCHMARK_DEFAULTS`) |
| `lib/mediaplan/createMediaToggleKeys.ts` | **Create** — canonical `CREATE_MEDIA_TOGGLE_KEYS` shared by create form + `MP_KEY_ORDER` |
| `lib/planning/mapEngineSplitToCreateTargets.ts` | **Create** — total map + Rule 2 reconcile + stale-key guard |
| `lib/planning/recommendedSplit.ts` | **Create** — freeze helpers / `definition_json` types for `recommended_split` |
| `lib/planning/__tests__/mapEngineSplitToCreateTargets.test.ts` | **Create** — map totality + residual (+ negative) + unmapped + stale key + form-key sync |
| `lib/planning/__tests__/planningChannelBench.test.ts` | **Create** — every row has four pillar sources + finite resolve guard |
| `lib/planning/adapter.ts` | **Only consumer** of old defaults — migrate to `.value`; attach pillar provenance where cheap |
| `lib/mediaplan/createPrefill.ts` | Add `audienceId` to href builder |
| `components/planning/StageCompare.tsx` | Save-then-navigate with frozen split |
| `app/tools/behavioural-planner/lib/bcs-engine.ts` | Doctrine comment only |
| `app/tools/behavioural-planner/components/*` | Per-pillar source labels (mix / results as needed) |
| `lib/planning/export/buildPlannerDeck.ts` (+ export button path) | Same provenance wording / version stamp |
| `app/mediaplans/create/page.tsx` | Audience hydrate + toggles + budget |
| `components/mediaplans/PlannerCreateTargetsStrip.tsx` | **Create** — “From planner” strip (mapped + unmapped) |
| `PLANNING_TOOL_BLUEPRINT.md` | Note P7-8 per-pillar `*_SOURCE` columns (doc-only follow-up) |

---

### Task 1: `PLANNING_CHANNEL_BENCH` module + migrate sole consumer (no shim)

**Files:**
- Create: `lib/planning/planningChannelBench.ts`
- Create: `lib/planning/__tests__/planningChannelBench.test.ts`
- Modify: `lib/planning/adapter.ts` (`resolveBench` + L230 / L286 call sites — **only** consumers of `BENCHMARK_DEFAULTS`)
- Delete: `lib/planning/benchmarkDefaults.ts` (or replace with non-aliased re-exports of `SEARCH_ENGINE_CHANNEL_ID` / version only — **never** `as BENCHMARK_DEFAULTS`)

**Why no shim:** Aliasing nested `{ value, source }` under `BENCHMARK_DEFAULTS` would make `resolveBench` read objects as numbers → silent `NaN` through BCS. Surface is tiny (one file); migrate in this task.

**Interfaces:**
- Produces:
  - `PLANNING_CHANNEL_BENCH_VERSION: string` (e.g. `"assembled-seed-v1"`)
  - `PLANNING_CHANNEL_BENCH: Record<string, PlanningChannelBenchRow>`
  - `SEARCH_ENGINE_CHANNEL_ID = "search"`
  - `type BenchPillar = { value: number; source: string }`
  - `type PlanningChannelBenchRow = { name: string; color: string; attn: BenchPillar; brand_effect: BenchPillar; direct_effect: BenchPillar; cpm: BenchPillar }`
  - Fallback source string exactly: `"Assembled seed — pending warehouse source"`
- `resolveBench` fallback type reads `fallback?.attn.value` (etc.); returns flat numbers for BCS.

- [ ] **Step 1: Write failing tests** — per-pillar shape + finite resolve guard.

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  PLANNING_CHANNEL_BENCH,
  PLANNING_CHANNEL_BENCH_VERSION,
} from "../planningChannelBench.js"

test("PLANNING_CHANNEL_BENCH rows have per-pillar value+source", () => {
  assert.ok(PLANNING_CHANNEL_BENCH_VERSION.length > 0)
  for (const [id, row] of Object.entries(PLANNING_CHANNEL_BENCH)) {
    for (const pillar of ["attn", "brand_effect", "direct_effect", "cpm"] as const) {
      assert.ok(Number.isFinite(row[pillar].value), `${id}.${pillar}.value`)
      assert.ok(row[pillar].source.trim().length > 0, `${id}.${pillar}.source`)
    }
  }
})

test("resolved bench pillars are finite numbers (no nested-object regression)", () => {
  // After adapter migration: whichever helper extracts fallback pillars must yield numbers.
  // Prefer testing the same path resolveBench uses (import a small exported extractor if needed).
  const row = PLANNING_CHANNEL_BENCH.tv
  const attn = row.attn.value
  const B = row.brand_effect.value
  const D = row.direct_effect.value
  const cpm = row.cpm.value
  assert.ok(Number.isFinite(attn) && Number.isFinite(B) && Number.isFinite(D) && Number.isFinite(cpm))
  assert.equal(typeof attn, "number") // not object
})
```

- [ ] **Step 2: Run test — expect FAIL** (module missing)

```bash
npx tsx --test lib/planning/__tests__/planningChannelBench.test.ts
```

- [ ] **Step 3: Implement `planningChannelBench.ts`** — migrate numeric seeds from current `BENCHMARK_DEFAULTS`; wrap each pillar; keep existing CSS token `color` strings. Note field rename: old flat used `B` / `D`; new row uses `brand_effect` / `direct_effect` (adapter maps to BCS `B`/`D`).

- [ ] **Step 4: Migrate `adapter.ts` in the same task** — update `resolveBench` fallback reads to `.value`; import `PLANNING_CHANNEL_BENCH` instead of `BENCHMARK_DEFAULTS`; delete `benchmarkDefaults.ts` (grep repo for any leftover imports). **Do not** ship `export { PLANNING_CHANNEL_BENCH as BENCHMARK_DEFAULTS }`.

- [ ] **Step 5: Run tests — expect PASS** (include existing `adapter` tests if present); commit `feat(planning): add PLANNING_CHANNEL_BENCH; migrate adapter off flat defaults`

---

### Task 2: `mapEngineSplitToCreateTargets` (map + Rule 2) — hardest review surface

**Files:**
- Create: `lib/mediaplan/createMediaToggleKeys.ts` — canonical media-type toggle keys (exclude `mp_production`, `mp_fixedfee`)
- Create: `lib/planning/mapEngineSplitToCreateTargets.ts`
- Create: `lib/planning/__tests__/mapEngineSplitToCreateTargets.test.ts`
- Modify (light): `app/mediaplans/create/page.tsx` — import `CREATE_MEDIA_TOGGLE_KEYS` for schema/defaults/`mediaTypes` so the sync test has one source of truth (or keep schema keys and assert equality in test against the exported const mirrored from schema — prefer shared const)

**Interfaces:**
- Produces:

```ts
export const UNMAPPED_MP_KEY = "__unmapped__" as const

/** Stable display / residual tie-break order — MUST equal CREATE_MEDIA_TOGGLE_KEYS. */
export const MP_KEY_ORDER = CREATE_MEDIA_TOGGLE_KEYS

export type CreateMediaToggleKey = (typeof MP_KEY_ORDER)[number]

export const ENGINE_TO_MP: Record<string, CreateMediaToggleKey | typeof UNMAPPED_MP_KEY> = {
  tv: "mp_television",
  paytv: "mp_television",
  bvod: "mp_bvod",
  svod: "mp_bvod", // revisit if product prefers mp_digivideo
  youtube: "mp_digivideo",
  radio: "mp_radio",
  streaming: "mp_digiaudio",
  podcasts: "mp_digiaudio",
  news_print: "mp_newspaper",
  news_digital: "mp_digidisplay",
  mags_print: "mp_magazines",
  mags_digital: "mp_digidisplay",
  ooh_street: "mp_ooh",
  ooh_billboard: "mp_ooh",
  ooh_shopping: "mp_ooh",
  ooh_transit: "mp_ooh",
  facebook: "mp_socialmedia",
  instagram: "mp_socialmedia",
  digital_other: UNMAPPED_MP_KEY,
  search: "mp_search",
  cinema: "mp_cinema",
}

export type EngineSplitChannel = {
  engine_channel_id: string
  pct: number
  dollars: number
}

export type CreateTargetRow = {
  mp_key: string // CreateMediaToggleKey | UNMAPPED_MP_KEY
  dollars: number
  pct: number
}

export type MapSplitResult = {
  campaign_budget: number
  create_targets: CreateTargetRow[]
}

/**
 * Aggregate engine channels → create targets.
 * - Unknown engine id → UNMAPPED
 * - mp_key not in knownCreateKeys → UNMAPPED (stale freeze guard)
 * - roundMoney2 per contribution and per bucket
 * - residual (campaign_budget - sum) → largest mapped bucket; skip UNMAPPED;
 *   tie → first in MP_KEY_ORDER; clamp so no bucket goes < 0 (spill deficit)
 * - pct re-derived from reconciled dollars / campaign_budget
 */
export function mapEngineSplitToCreateTargets(
  channels: EngineSplitChannel[],
  opts: {
    /** Authoritative budget (brief / freeze). If omitted, sum(roundMoney2(channel dollars)). */
    campaignBudget?: number
    /**
     * Current create container keys. At create hydrate MUST be derived from the real form
     * media-toggle field names — do not pass `new Set(MP_KEY_ORDER)` alone (tautological).
     * Default MP_KEY_ORDER is only for freeze-time / unit tests when form is unavailable.
     */
    knownCreateKeys?: ReadonlySet<string>
  } = {}
): MapSplitResult
```

**Also export** `normalizeFrozenCreateTargets(rows, knownCreateKeys, campaignBudget)` for create-time: any frozen `mp_key` not in `knownCreateKeys` → fold into `UNMAPPED`; re-run residual if needed so `sum === campaign_budget`.

`CREATE_MEDIA_TOGGLE_KEYS` (exact set — matches create `mediaPlanSchema` media booleans today):

```ts
export const CREATE_MEDIA_TOGGLE_KEYS = [
  "mp_television",
  "mp_radio",
  "mp_newspaper",
  "mp_magazines",
  "mp_ooh",
  "mp_cinema",
  "mp_digidisplay",
  "mp_digiaudio",
  "mp_digivideo",
  "mp_bvod",
  "mp_search",
  "mp_socialmedia",
  "mp_progdisplay",
  "mp_progvideo",
  "mp_progbvod",
  "mp_progaudio",
  "mp_progooh",
  "mp_influencers",
  "mp_integration",
] as const
```

- [ ] **Step 1: Write failing tests** (these are the acceptance gates for this task):

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { PLANNING_CHANNEL_BENCH } from "../planningChannelBench.js"
import { CREATE_MEDIA_TOGGLE_KEYS } from "../../mediaplan/createMediaToggleKeys.js"
import {
  ENGINE_TO_MP,
  UNMAPPED_MP_KEY,
  mapEngineSplitToCreateTargets,
  normalizeFrozenCreateTargets,
  MP_KEY_ORDER,
} from "../mapEngineSplitToCreateTargets.js"

test("ENGINE_TO_MP is total over PLANNING_CHANNEL_BENCH keys", () => {
  for (const id of Object.keys(PLANNING_CHANNEL_BENCH)) {
    assert.ok(id in ENGINE_TO_MP, `missing map entry: ${id}`)
  }
  assert.equal(ENGINE_TO_MP.digital_other, UNMAPPED_MP_KEY)
})

test("MP_KEY_ORDER matches create form media-type toggles", () => {
  assert.deepEqual([...MP_KEY_ORDER], [...CREATE_MEDIA_TOGGLE_KEYS])
})

test("facebook+instagram collapse; sum targets === campaign_budget", () => {
  const { campaign_budget, create_targets } = mapEngineSplitToCreateTargets(
    [
      { engine_channel_id: "facebook", pct: 40, dollars: 40_000 },
      { engine_channel_id: "instagram", pct: 60, dollars: 60_000 },
    ],
    { campaignBudget: 100_000 }
  )
  assert.equal(campaign_budget, 100_000)
  const social = create_targets.find((t) => t.mp_key === "mp_socialmedia")
  assert.ok(social)
  const sum = create_targets.reduce((s, t) => s + t.dollars, 0)
  assert.equal(sum, 100_000)
})

test("unknown engine and digital_other go to unmapped; residual never sinks there", () => {
  const { create_targets } = mapEngineSplitToCreateTargets(
    [
      { engine_channel_id: "tv", pct: 50, dollars: 49_500 }, // $1k-scale drift vs budget
      { engine_channel_id: "digital_other", pct: 25, dollars: 25_000 },
      { engine_channel_id: "future_x", pct: 25, dollars: 25_000 },
    ],
    { campaignBudget: 100_000 }
  )
  const unmapped = create_targets.find((t) => t.mp_key === UNMAPPED_MP_KEY)
  const tv = create_targets.find((t) => t.mp_key === "mp_television")
  assert.ok(unmapped && unmapped.dollars === 50_000)
  // residual 100_000 - (49_500 + 50_000) = 500 → tv (mapped), not unmapped
  assert.ok(tv && tv.dollars === 50_000)
  const sum = create_targets.reduce((s, t) => s + t.dollars, 0)
  assert.equal(sum, 100_000)
})

test("negative residual does not drive a small mapped bucket below zero", () => {
  // Engine dollars overshoot authoritative budget (planner $1k pre-round).
  const { create_targets, campaign_budget } = mapEngineSplitToCreateTargets(
    [
      { engine_channel_id: "tv", pct: 10, dollars: 1_000 },
      { engine_channel_id: "radio", pct: 90, dollars: 100_000 },
    ],
    { campaignBudget: 100_000 }
  )
  assert.equal(campaign_budget, 100_000)
  for (const t of create_targets) {
    assert.ok(t.dollars >= 0, `${t.mp_key} went negative`)
  }
  assert.equal(
    create_targets.reduce((s, t) => s + t.dollars, 0),
    100_000
  )
})

test("stale frozen mp_key folds into unmapped without dropping dollars", () => {
  // Simulate hydrate: known keys = real form set that no longer includes a renamed container.
  const known = new Set<string>([...CREATE_MEDIA_TOGGLE_KEYS])
  const { create_targets, campaign_budget } = normalizeFrozenCreateTargets(
    [
      { mp_key: "mp_socialmedia", dollars: 70_000, pct: 70 },
      { mp_key: "mp_deleted_container", dollars: 30_000, pct: 30 },
    ],
    known,
    100_000
  )
  assert.equal(campaign_budget, 100_000)
  assert.ok(create_targets.some((t) => t.mp_key === UNMAPPED_MP_KEY && t.dollars === 30_000))
  assert.ok(!create_targets.some((t) => t.mp_key === "mp_deleted_container"))
  assert.equal(
    create_targets.reduce((s, t) => s + t.dollars, 0),
    100_000
  )
})
```

Adjust expected residual arithmetic to match `roundMoney2` exactly once implemented — keep the invariants: `digital_other` unmapped, residual on largest **mapped**, buckets ≥ 0, stale key → unmapped, `sum === campaign_budget`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx tsx --test lib/planning/__tests__/mapEngineSplitToCreateTargets.test.ts
```

- [ ] **Step 3: Implement** using `roundMoney2` from `@/lib/format/money`.

Residual algorithm (exact):

1. Resolve each channel → `mp_key` via `ENGINE_TO_MP[id] ?? UNMAPPED`; if resolved key not in `knownCreateKeys`, force `UNMAPPED`.
2. Accumulate `roundMoney2(dollars)` into a `Map<mp_key, number>`.
3. `campaign_budget = opts.campaignBudget ?? sum(map values)` then `roundMoney2`.
4. Round each bucket with `roundMoney2`.
5. `residual = roundMoney2(campaign_budget - sum(buckets))` (may be **negative**).
6. Apply residual to mapped keys only (`!== UNMAPPED`), largest dollars first, ties → earliest in `MP_KEY_ORDER`:
   - Positive residual: add to largest mapped (or `UNMAPPED` only if no mapped buckets).
   - Negative residual: subtract from largest mapped, but **clamp that bucket at 0**; if deficit remains, continue to next-largest mapped; only if still remaining after all mapped are 0, subtract from `UNMAPPED` (clamp ≥ 0). Final `sum` must equal `campaign_budget` (if all buckets hit 0 and deficit remains, that is a bug — assert in tests that overshoot is absorbable given inputs, or leave leftover on largest mapped only when it would go negative **after** exhausting others — prefer the spill loop so sum stays honest).
7. Recompute `pct` from reconciled dollars / `campaign_budget`. Dollars are the contract.

- [ ] **Step 4: Run tests — PASS**; commit `feat(planning): map engine split to create targets with Rule 2 residual`

---

### Task 3: Freeze types + helper for `recommended_split`

**Files:**
- Create: `lib/planning/recommendedSplit.ts`
- Create: `lib/planning/__tests__/recommendedSplit.test.ts` (build snapshot from allocated channels)

**Interfaces:**
- Produces:

```ts
export type RecommendedSplitV1 = {
  version: 1
  frozen_at: string
  bench_version: string
  engine_params_version?: string
  budget: number
  channels: EngineSplitChannel[]
  create_targets: CreateTargetRow[]
  campaign_budget: number
}

export function buildRecommendedSplitV1(args: {
  allocated: Array<{ engineChannelId: string; pct: number; dollars: number }>
  budget: number
  benchVersion: string
  engineParamsVersion?: string
  now?: Date
}): RecommendedSplitV1
```

Implementation: map allocated → `channels`; call `mapEngineSplitToCreateTargets(channels, { campaignBudget: budget })`; set `create_targets` + `campaign_budget` from result; `frozen_at = (now ?? new Date()).toISOString()`.

- [ ] Failing test: snapshot includes `create_targets`, `bench_version`, and `sum(create_targets.dollars) === campaign_budget`.
- [ ] Implement + pass + commit `feat(planning): build frozen recommended_split snapshot`

---

### Task 4: Provenance tagging + doctrine comment + UI/deck copy

**Files:**
- Modify: `lib/planning/adapter.ts` (bench value extraction; optional `pillarSources` on adapted channel)
- Modify: `app/tools/behavioural-planner/lib/bcs-engine.ts` — doctrine comment above A computation
- Modify: mix / results components that currently badge whole channels (`ChannelMixTable`, `ReachProfile`, etc.)
- Modify: `lib/planning/export/buildPlannerDeck.ts` (and any deck slide builders)

**Rules:**
- A: `rm` iff `isRmMeasured`; else benchmark.
- T/E/C: always benchmark; show module `source` string (or warehouse per-pillar later).
- Copy examples: `"Source: Roy Morgan"` / `"Source: Assembled seed — pending warehouse source"` — **not** “RM-driven”.

- [ ] Add short doctrine comment in `computeBcs` near affinity A (no logic change).
- [ ] Surface per-pillar source in Stage E UI where scores are shown (minimum: mix table footnote / pillar chips — match existing badge patterns, tokens only).
- [ ] Deck: same wording; include `PLANNING_CHANNEL_BENCH_VERSION` in provenance footer if a footer exists; never attribute attn/B/D/cpm to Roy Morgan.
- [ ] Optional probe (non-blocking): try selecting warehouse source columns only if you already have a Snowflake env in this branch — **do not** wire a single `b.SOURCE` into four pillars. Prefer a one-line comment in `queries.ts` pointing at P7-8 `ATTN_SOURCE` / ….
- [ ] Doc note in `PLANNING_TOOL_BLUEPRINT.md` under PLANNING_CHANNEL_BENCH: replace single `source` with per-pillar `*_SOURCE` for P7-8.
- [ ] Commit `feat(planning): per-pillar RM vs benchmark provenance in UI and deck`

---

### Task 5: Stage E save-then-navigate with `audienceId`

**Files:**
- Modify: `lib/mediaplan/createPrefill.ts`
- Modify: `components/planning/StageCompare.tsx`
- Modify: save path that writes `definition_json` (follow `handleUseAudience` / audience POST-PATCH in StageCompare + planning API clients)

**Interfaces:**
- `buildCreateCampaignHref({ audienceId, clientId?, campaignName?, start?, end? })` — always set `audienceId` when provided; keep identity params as fail-open helpers only.

- [ ] Extend `CreateCampaignPrefill` + `buildCreateCampaignHref` with `audienceId`.
- [ ] On “Use audience →” / before Start campaign: merge `buildRecommendedSplitV1(...)` into `definition_json.recommended_split` using current allocation + `PLANNING_CHANNEL_BENCH_VERSION`.
- [ ] “Start campaign”: if audience not yet saved for this draft, save/update first; then `router.push(buildCreateCampaignHref({ audienceId: saved.id, ...brief }))`. Disable/hide Start until save succeeds (or inline save-on-click).
- [ ] Toast on save failure; do not navigate with a missing id.
- [ ] Manual smoke: Stage E → Start campaign URL contains `audienceId=` and not raw `$`/`pct` params for the split.
- [ ] Commit `feat(planning): freeze split and hand off create via audienceId`

---

### Task 6: Create page hydrate + “From planner” strip (M1)

**Files:**
- Create: `components/mediaplans/PlannerCreateTargetsStrip.tsx`
- Modify: `app/mediaplans/create/page.tsx` (near existing prefill effect ~L3112)
- Use: `GET /api/planning/audiences/[id]` (already exists — confirm auth/tenant)

**Strip UI:**
- Card/panel using tokens (`bg-card`, `border-border`, `text-muted-foreground`, `.num` on dollars).
- Title: “From planner”.
- One row per `create_targets` entry with dollars + %; `__unmapped__` labelled **“Unmapped from planner”**.
- No line-item editors; no invented rates.

**Hydration effect:**
1. Read `audienceId` from `searchParams`.
2. If absent → existing identity prefill only (today’s behaviour).
3. If present → fetch audience; on 403/404/no `recommended_split` → toast + fail-open manual.
4. Prefer `recommended_split.create_targets`; else `mapEngineSplitToCreateTargets(channels)`.
5. Derive `knownCreateKeys` from the **live create form** media-toggle field names (e.g. `mediaTypes.map(m => m.name)` or `CREATE_MEDIA_TOGGLE_KEYS` as used by the form schema — **not** `new Set(MP_KEY_ORDER)` alone). Pass that set into `normalizeFrozenCreateTargets(..., knownCreateKeys, campaign_budget)` so a renamed/removed container actually fires the stale-key path.
6. `form.setValue` each mapped `mp_*` true when dollars > 0; set `mp_campaignbudget`; never set `__unmapped__` as a form field.
7. Store strip rows in component state (not as MEDIA lines).
8. Still apply identity prefill from query params and/or audience/brief fields when present.

- [ ] Unit-test strip not required if presentational; keep mapping tests as the contract.
- [ ] Manual verify: strip sum === `mp_campaignbudget`; no MEDIA rows created; cross-tenant id does not hydrate.
- [ ] Commit `feat(mediaplans): apply planner create_targets strip on create`

---

### Task 7: Verification checklist (no new features)

Run:

```bash
npx tsx --test lib/planning/__tests__/planningChannelBench.test.ts
npx tsx --test lib/planning/__tests__/mapEngineSplitToCreateTargets.test.ts
npx tsx --test lib/planning/__tests__/recommendedSplit.test.ts
npx tsx --test lib/planning/__tests__/adapter.test.ts
```

Manual:
- [ ] Mix/deck: A = “Source: Roy Morgan” only when RM-measured; T/E/C benchmark sources; base audience does not claim “RM-driven”.
- [ ] Start campaign → create shows From planner strip; `digital_other` dollars under Unmapped.
- [ ] Create without `audienceId` unchanged.
- [ ] No fabricated line items in containers after hydrate.

- [ ] Final commit only if checklist gaps fixed: `test(planning): verify provenance + carry-through gates`

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Client PLANNING_CHANNEL_BENCH `{value,source}` + version | 1 |
| Migrate sole `adapter.ts` consumer; **no** `BENCHMARK_DEFAULTS` alias | 1 |
| Finite pillar guard test | 1 |
| A via IS_RM_MEASURED; T/E/C bench; provenance wording | 4 |
| Warehouse SOURCE non-blocking; per-pillar P7-8 flag | 4 |
| Doctrine comment, no weight change | 4 |
| Total ENGINE_TO_MP; digital_other → unmapped | 2 |
| Rule 2 roundMoney2 + residual largest **mapped** + ≥0 clamp | 2 |
| `MP_KEY_ORDER` === create form media toggles | 2 |
| Stale mp_key → unmapped; hydrate uses **form** known keys | 2, 6 |
| Freeze create_targets at save; **no Xano migration** | 3, 5 |
| audienceId handoff; save-before-nav | 5 |
| Create M1 strip + toggles + budget; fail-open | 6 |
| No fabricated line items | 6 (explicit) |
| Verify sum === budget; deck provenance | 7 |

## Placeholder scan

None intentional — map table and residual algorithm (incl. negative clamp) are fully specified in Task 2.

## Type consistency

- `EngineSplitChannel` / `CreateTargetRow` / `UNMAPPED_MP_KEY` / `RecommendedSplitV1` defined in Tasks 2–3 and reused in 5–6.
- `MP_KEY_ORDER` === `CREATE_MEDIA_TOGGLE_KEYS`; create form imports the same const.
- Create form only receives real `mp_*` keys from that set; `__unmapped__` is strip-only.
