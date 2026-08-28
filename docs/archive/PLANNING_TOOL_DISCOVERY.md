# PLANNING_TOOL_DISCOVERY — Stages A–E (live planner)

**Date:** 2026-07-12  
**Scope:** Discovery only — Demand Flow planning workflow stages A–E.  
**Surface:** `/tools/behavioural-planner` → `BehaviouralPlannerClient`  
**Method:** Code inventory of `components/planning/**`, `app/tools/behavioural-planner/planner-client.tsx`, `app/api/planning/**`, `lib/planning/**`, AVA bridge / `chat-v2`.  
**Only file written:** this document.  
**Supersedes:** the 2026-07-11 P7-0 mock inventory in this path (that verdict is obsolete — the planner is live-wired).

Confidence legend: unmarked claims ≥90%. Items below 90% are flagged inline.

---

## 1. File map

### Orchestrator & shared state

| Role | Path |
|------|------|
| Page entry (role gate: non-client) | `app/tools/behavioural-planner/page.tsx` |
| Workflow shell (fetches, BCS, stage switch) | `app/tools/behavioural-planner/planner-client.tsx` |
| Stage stepper UI | `components/planning/PlanningStepper.tsx` |
| Shared workflow state | `components/planning/store.ts` — `useReducer` + `planningReducer` / `PlanningWorkflowState` (not Zustand) |
| Stage ids / objective presets / BCS weight shape | `components/planning/constants.ts` |

State lives in the client: `const [state, dispatch] = useReducer(planningReducer, …)`. There is no global planning store outside the planner page.

### Component per stage

| Stage | Label | Component | Primary APIs |
|-------|-------|-----------|--------------|
| A | Brief & objective | `components/planning/StageBrief.tsx` | `GET /api/clients` (client picker only) |
| B | Audiences | `components/planning/StageAudiences.tsx` | `POST /api/planning/audience` (debounced per audience); segment list from meta |
| C | Demand diagnosis | `components/planning/StageDiagnosis.tsx` | None (local diagnosis state → BCS inputs) |
| D | Constraints | `components/planning/StageConstraints.tsx` | None (toggles `excludedChannelIds` in store) |
| E | Compare & plan | `components/planning/StageCompare.tsx` (+ `OutcomeCharts.tsx`, `SavedAudienceAttachList.tsx`) | `POST /api/planning/audiences` (save); `GET /api/planning/audiences?clients_id=` (list); charts are client-computed |

### Shared / catalogue APIs (all stages)

| Route | Used for |
|-------|----------|
| `GET /api/planning/meta` | Waves, segments, channel taxonomy + benches, methodology, engine_params — loaded once on mount |
| `POST /api/planning/audience` | Compose reach / affinity for each audience draft |
| `GET\|POST /api/planning/audiences` | Xano saved-audience list/create (Stage E + attach list) |
| `app/api/planning/audiences/[id]/route.ts` | Patch/delete saved audience (attach list) |
| `app/api/planning/audiences/by-mba/route.ts` | MBA-scoped list (client dashboard; not Stage E primary path) |

### BCS / DFII (client-side, not HTTP)

| Concern | Path |
|---------|------|
| Score + allocate | `app/tools/behavioural-planner/lib/bcs-engine.ts` (`computeBcs`, `allocate`) |
| Audience API → engine channels | `lib/planning/adapter.ts` |
| DFII | `lib/planning/dfii.ts` |
| Stage C → objective/weights nudges | `deriveBcsParams` in `components/planning/store.ts` |
| Warehouse aggregate → response | `lib/planning/queries.ts` + `lib/planning/compute.ts` |

**Note:** Legacy mock cards under `app/tools/behavioural-planner/components/` (`ObjectiveCard`, `AudienceCard`, `ResultsPanel`, `AvaNarration`, etc.) are **not** mounted by the five-stage shell. Live UI is the `Stage*` components above.

---

## 2. Objective cards (Stage A) — Create:Capture display vs BCS weights

### Where the four cards render

`StageBrief.tsx` maps `OBJECTIVE_PRESETS` (`awareness` | `consideration` | `capture` | `retention`) into a 4-column card grid.

Each card shows:
- `preset.label`
- `preset.blurb`
- Caption: `Create:Capture {100 - preset.createCapture}:{preset.createCapture}`  
  (e.g. Awareness → `Create:Capture 80:20`)

Preset definitions live in `components/planning/constants.ts`:

| Kind | createCapture | weights A/T/E/C |
|------|---------------|-----------------|
| awareness | 20 | 35 / 30 / 25 / 10 |
| consideration | 45 | 30 / 25 / 30 / 15 |
| capture | 80 | 20 / 20 / 35 / 25 |
| retention | 55 | 25 / 25 / 30 / 20 |

### How they feed BCS

Click → `onObjective(kind)` → `SET_OBJECTIVE` in `store.ts`:
1. Sets `brief.objectiveKind`
2. Copies `preset.createCapture` → `diagnosis.createCapture`
3. Copies `preset.weights` → `diagnosis.weights`

Later, `deriveBcsParams(diagnosis)` produces:
- `objective` = `diagnosis.createCapture` (0 = create/brand … 100 = capture/action)
- `weights` = base weights + salience / gap / capture nudges

`planner-client` passes those into `computeBcs` / `allocate`.

Stage C (`StageDiagnosis`) can move the Create↔Capture **slider** (updates `createCapture` only via `PATCH_DIAGNOSIS`). It does **not** re-render Stage A captions and does **not** expose A/T/E/C sliders in the UI. Weight nudges still apply via `deriveBcsParams`.

### Separable? **Yes**

- **Display** of Create:Capture on the cards is purely presentational from `OBJECTIVE_PRESETS.createCapture`.
- **BCS inputs** are `diagnosis.createCapture` + `diagnosis.weights` (separate fields).
- Same click currently sets both, but they are not one coupled value in the engine path. Stage C can change `createCapture` without changing the Stage A caption strings or the stored weight vector.
- Confidence **95%**.

---

## 3. Segment lens (Stage B)

### Is a segment required?

**Yes, for a live audience query and to leave Stage B.**

Evidence:
- `toAudienceRequest`: returns `null` if `!draft.segmentId` → `fetchOne` no-ops (no POST).
- `isAudiencesComplete` / Stage B Continue: every audience needs truthy `segmentId`.
- `POST /api/planning/audience` rejects missing `segment_id` (400: `"segment_id is required"`).
- Segment chips always set a concrete `segment_id`; UI has no “clear selection” control.

Default after meta load: `defaultSegmentId(meta)` prefers id `"metro"`, else name matching metro/cap city, else first segment — **not** base.

### What if none selected?

Before meta RESET, initial `segmentId` is `""`. No audience POST fires; Live panel stays empty / “No channel affinities yet.” Continue stays disabled. After meta, a default segment is always applied.

### Where does “Base (All People)” resolve?

Two different meanings of “base”:

1. **Affinity / universe denominator (always in SQL)**  
   In `getAudienceProfile` (`lib/planning/queries.ts`), reference cells are hard-coded:
   - `f.SEGMENT_ID = 'base' AND f.STATE = 'NAT'` → `BASE_WC*`  
   Used for affinity index and `universe_wc` (POPULATION `base_wc`).  
   This runs **regardless of which segment lens the user selected**.

2. **Selectable segment lens**  
   Options come from Snowflake `PLANNING_DIM_SEGMENT` via `GET /api/planning/meta`.  
   Product/blueprint (`PLANNING_TOOL_BLUEPRINT.md`) lists Base as a lens from `all people.xlsx`.  
   **Whether a row with `segment_id = 'base'` is present in the live dim is warehouse data — not hardcoded in the app.** Confidence that Base appears as a chip: **~80%** (blueprint + loader design; not verified against a live meta response in this pass).

### Is no-segment = base a valid query already?

**No as a missing `segment_id`.** The API never treats omitted segment as base.

**Yes as selecting `segment_id: "base"`** (if that dim row exists): selection filter uses `SEGMENT_ID = 'base'`, and the affinity denominator is also base/NAT — affinity indexes ≈ 100 when demos/geo match the national base. Tests already exercise `segment_id: "base"` in `lib/planning/__tests__/compute.test.ts`.

Confidence **92%** on API/SQL behaviour; **~80%** that Base is offered in UI today.

---

## 4. Channels — catalogue, reach, index

### Canonical list — where defined

**Warehouse-driven**, not a frontend constant list:

- Dim: `PLANNING_DIM_CHANNEL` (+ `PLANNING_CHANNEL_BENCH`) via `getPlanningMeta` → `GET /api/planning/meta` → `PlanningMeta.channels`.
- Facts: `PLANNING_FACT_REACH` aggregated in `getAudienceProfile`.

### Include / exclude rules in code today

| Layer | Included | Excluded / special |
|-------|----------|-------------------|
| Audience response | All fact channels for the wave except `POPULATION` (used only for audience size / universe) | Bench-only meta rows with no fact row skipped |
| Reach profile (`adapter`) | RM-measured rows (level totals + leaves) | Non-RM rows skipped for profile list |
| BCS / Stage D / Stage E mix | Leaves with non-null `engine_channel_id` | Rows with null `engine_channel_id` (level totals) not scored; duplicate engine ids collapsed |
| Search | Injected client-side from `BENCHMARK_DEFAULTS` / `SEARCH_ENGINE_CHANNEL_ID = "search"` | Skipped if present in API leaves; affinity forced to 100; reach 0; `isRmMeasured: false` |
| Stage D exclusions | User toggles engine channel ids out of `computeBcs` / allocate | Still in adapted set until filtered |

**Expected engine leaf ids** (from `lib/planning/benchmarkDefaults.ts` fallbacks — not the exclusive warehouse set):  
`tv`, `bvod`, `ooh-lg`, `ooh-st`, `audio-br`, `audio-dig`, `social-m`, `social-t`, `youtube`, `search`, `display`, `cinema`.

Exact RM taxonomy rows (level1/level2, which map to which engine id) are **data-dependent**. Confidence on the full live include list without querying Snowflake: **~70%**.

### Where reach and index are computed

Server (`lib/planning/compute.ts` + aggregates from `queries.ts`):

```
reach_pct = selection_wc / audience_wc          // audience_wc = Σ POPULATION selection_wc
affinity  = (selection reach%) / (base reach%) × 100
            // base = segment 'base' + state NAT, all genders/bands
```

Also always computed: `reach_pct_addressable`, `reach_pct_total` (independent of request `reach_basis`).

Phase 1: `age_fit` and `gender_fit` are hard-coded to `1.0` (reach already cell-filtered).

### Locked / current `AudienceResponse` fields (quote)

From `lib/planning/types.ts` (authoritative vs older blueprint §8.3 snippet):

```ts
{
  wave_id: string
  reach_basis: "addressable" | "total"
  audience_wc: number
  unweighted_n: number
  universe_wc: number
  suppressed_cells: number
  channels: Array<{
    channel_id: string
    engine_channel_id: string
    reach_wc: number
    reach_pct: number
    reach_pct_addressable: number
    reach_pct_total: number
    affinity_by_segment: Record<string, number | null>  // key = requested segment_id
    age_fit: number
    gender_fit: number
    is_rm_measured: boolean
    age_base: number
    bench: { attn; brand_effect; direct_effect; cpm } | nulls
  }>
}
```

### Top affinity mini-profile — same data source?

**Yes.** Stage B `LivePanel` → `topAffinities(adapted, draft.segmentId, 5)` sorts `adapted.channels` by `ch.aff[segmentId]` descending.

That adapted set is `adaptAudienceToEngine` over the same `POST /api/planning/audience` response used for Stage D constraints and Stage E BCS (affinity → BCS Audience-fit term). Mini-profile shows **top 5 by index among BCS leaf (+ Search) channels**, not the full RM reach-profile taxonomy.

Confidence **95%**.

---

## 5. Outputs stage (E) — components & recommended split

### Current output UI

In `StageCompare.tsx` / related:

1. **Per-audience summary cards** — size, n, blended reach %, lead channel, top-3 mix %, top DFII; “Use audience →” save; optional “Start campaign” prefill.
2. **Mix table tab** — channels × audiences: allocation %, reach wc, dollars, DFII, lead marker.
3. **Charts tab** (`OutcomeCharts.tsx`) — Reach × Index combo, reach×index scatter (point size = DFII), DFII ranked bar, addressable-vs-total gap chart.
4. **SavedAudienceAttachList** — client-visible attach / load saved definitions.
5. Methodology open / badges (wave, Create:Capture, reach basis).

### Recommended split logic — **yes, exists**

**BCS score** (`computeBcs`):

```ts
A = min(100, affAvg * aff_scale * ageMod * genderMod)
T = min(100, attn * attn_scale)
E = (1 - O) * B + O * D          // O = objective/100
C = min(100, ((A/100)*(T/100)*100)/cpm * cost_scale)
bcs = wA*A + wT*T + wE*E + wC*C
```

Empty `inputs.segments` → returns `[]` (no scores).

**Budget split** (`allocate`):

```ts
topN = round(alloc_top_n)   // default 8
power = alloc_power         // default 1.5
top = scored.slice(0, topN)
weight_i = (bcs_i / 100) ^ power
pct_i = weight_i / sum(weights) * 100
dollars_i = round(pct_i/100 * budget / 1000) * 1000
```

Defaults: `CODE_ENGINE_PARAMS` in `lib/planning/engineParams.ts` (`alloc_top_n: 8`, `alloc_power: 1.5`); overridable via `meta.engine_params`.

**DFII** (display / ranking, not the dollar allocator):

```ts
dfii = round(bcs / mean(bcs of included channels) * 100)
```

Quoted from `lib/planning/dfii.ts`. Stage E applies `dfii(b.scored.map(s => ({ bcs: s.bcs })))` after Stage D exclusions already removed channels from `scored`/`allocated`.

Confidence **98%**.

---

## 6. AVA integration point

### Does the planning tool have an AVA/chat surface?

**Yes — two layers:**

1. **Global chat widget** (`components/ChatWidget.tsx` via `ClientLayout`) — admin-only; posts to `/api/chat-v2`.
2. **Planner-specific control** — `AvaPlanningInsightAction` in the planner header (“Find the insight”) → `openAvaChat({ message })` with prewired copy: *“Find the audience insight and planning theme for the audience(s) on screen.”*

`AvaNarration.tsx` in the old mock folder is **deterministic BCS prose only** — not mounted in the five-stage UI and not chat.

### How chat-v2 receives page context

1. `planner-client` builds `PageContext` in `getPageContext()` and calls `setAssistantContext({ pageContext })` on change; clears on unmount.
2. `ClientLayout` reads `getAssistantContext()?.pageContext` (path-matched) and passes `getPageContext` into `ChatWidget`.
3. On send, `ChatWidget` includes `pageContext` in the POST body to `/api/chat-v2`.
4. Route: `buildAvaSystemPrompt(mode, pageContext, …)` + `AvaToolContext.pageContext`; appendix explicitly documents `state.surface: "planning"`.

Planner snapshot shape (trimmed):

```ts
{
  route: { pathname },
  generatedAt,
  entities: { clientName?, campaignName? },
  pageText: { title: "Demand Flow planner", breadcrumbs: ["Tools", "Planning"] },
  state: {
    surface: "planning",
    stage, waveId,
    brief: { clientId, clientName, startDate, endDate, budget, objectiveKind },
    activeAudienceId, activeReachBasis, audienceCount,
    audiences: [{ id, name, reachBasis, states, audienceWc, unweightedN, robustnessBand, robustnessLabel }]
  }
}
```

Does **not** currently push BCS mix %, DFII, or channel scores into page context (capped audience list only). Confidence **95%**.

---

## Confidence & gaps summary

| Topic | Confidence | Gap |
|-------|------------|-----|
| File map / stage wiring | 98% | — |
| Create:Capture display vs BCS weights separable | 95% | — |
| Segment required; empty → no query | 98% | — |
| SQL base/NAT = affinity denominator | 98% | — |
| Base as selectable lens in live meta | **80%** | Needs live `GET /api/planning/meta` segments inspect |
| Exact channel taxonomy include/exclude in warehouse | **70%** | Needs Snowflake / meta.channels dump |
| Mini-profile same source as affinity indexes | 95% | — |
| allocate / DFII quote | 98% | — |
| AVA pageContext path | 95% | — |

Hard stop: findings only — no implementation in this pass.
