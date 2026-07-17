# Demand Flow Planning Tool — Build Blueprint
2026-07-11 (v2 — includes §8 reconciliation with PLANNING_TOOL_DISCOVERY.md).
Basis: validated Roy Morgan crosstab-pack structure (8 sheets = national + 7 states; 26
gender×age columns with discrete 18–24; channel taxonomy rows to provider level), the
composition rules locked in the prototype session, and the decision that the tool lives
inside AssembledView. P7-0 discovery confirmed `app/tools/behavioural-planner` is the
prototype (92%).

## 1. What the tool does (product shape)

1. **Audience builder:** pick a segment lens (Base, Metro, High Net Worth, +3 future — all
   data rows, adding one = running the loader), states, gender, age bands → tool composes
   the audience (population '000s) from Roy Morgan weighted counts.
2. **Channel reach profile:** reach% by channel → vehicle → provider for that audience.
3. **Mix guidance:** BCS-scored ranked channel table (see §8 — the prototype engine stays).
4. **Handoff:** save audience + mix against a client; "Start campaign" prefills create-campaign.
5. **Visualisation:** audience/channel charts on the existing chart system.
6. **PPTX export:** branded audience-story deck via pptxgenjs (template = D8).
7. **Client visibility:** read-only "Planned audience" section on the client campaign
   dashboard for saved audiences with `client_visible = true` (default OFF).

## 2. Composition rules (engine law)
- Compose on weighted counts (`wc`), never percentages. reach% = Σ(channel wc) ÷ Σ(audience wc).
- Segments are non-additive lenses; segment is a single-select scoping the whole builder;
  intersections exist only as their own workbook/segment row.
- Suppressed cells (thin bases) stored null, excluded, badge shown.
- Search + Retail Media are benchmark-sourced, always badged non-RM.

## 3. Data architecture — Snowflake facts + Xano saved audiences

```
PLANNING_DIM_WAVE      (wave_id, label e.g. 'MAR26E1_ASM', loaded_at, source_files)
PLANNING_DIM_SEGMENT   (segment_id, name, is_intersection, notes)
PLANNING_DIM_CHANNEL   (channel_id, level1, level2, sort_order, is_rm_measured,
                        age_base NUMBER /* 14 or 18 — YouTube/Social rows are 18+ */,
                        engine_channel_id)                    -- engine map, see §8
PLANNING_FACT_REACH    (wave_id, segment_id, state /* NAT,NSW,VIC,QLD,SA,WA,TAS,NT */,
                        gender, age_band /* 14-24,25-34,35-49,50-64,65+ */, channel_id,
                        wc_addressable NUMBER NULL, wc_total NUMBER NULL,
                        v_pct_addressable NUMBER NULL, v_pct_total NUMBER NULL)
PLANNING_CHANNEL_BENCH (channel_id, attn, brand_effect, direct_effect, cpm,
                        attn_source, brand_effect_source, direct_effect_source, cpm_source,
                        updated_by, updated_at)      -- non-RM benchmarks; P7-8 per-pillar *_SOURCE (not a single source), see §8
```
Population universe rows: the workbook's `(POPN '000)` row loads as channel_id
'POPULATION' (wc_addressable = wc_total = universe). TOTAL/rollup columns (Men 50+,
18+, ALL PEOPLE) are validation-only in the loader, not stored.

Ingestion per wave (twice yearly): `scripts/planning/parse-roy-morgan.ts` → CSVs +
validation report (national ≈ Σstates; v% recomputed from wc within tolerance) →
Snowsight COPY into a new wave_id (append-only).

## 4. App integration
- Surface: `/tools/behavioural-planner` stays; add sidebar entry "Planning"; add staff
  page guard (P7-0: currently middleware-session only, no guard, not in nav).
- API group `app/api/planning/*`, gated `requireRole(request, ["admin","manager"])`:
  - `GET /api/planning/meta` — waves, segments, states, age bands, channel taxonomy +
    benchmarks (unstable_cache, tag `planning-meta`, 24h TTL)
  - `POST /api/planning/audience` — request `{wave_id, segment_id, states[], genders[],
    age_bands[]}` → response per §8.3 (locked)
  - `POST/GET /api/planning/audiences` — Xano proxy for saved audiences
    (`planning_audiences`: id, created_at, clients_id, mba_number NULLable, name,
    definition_json, composed_wc, client_visible bool default false, created_by_email)

## 5. Build sequence

| # | Build | Contents | Luke's steps |
|---|-------|----------|--------------|
| P7-0 | Discovery | DONE 2026-07-11 → PLANNING_TOOL_DISCOVERY.md | — |
| P7-1 | Warehouse | DDL §3 + parser script + wave-1 load + validation report | Run loader; execute DDL/COPY in Snowsight |
| P7-2 | API | meta + audience routes, snowflake queries, gates, caching | — |
| P7-3 | Rewire | Planner consumes live meta/audience (§8 contract); segment scoping; suppression badges; staff guard + sidebar entry | Acceptance test vs workbook (D6) |
| P7-4 | Persistence + handoff | Xano `planning_audiences` + save/list + create-campaign prefill | Create Xano table |
| P7-5 | Visualisation | Charts via existing chart system | Smoke |
| P7-6 | PPTX export | pptxgenjs + Assembled template | Supply/approve template (D8) |
| P7-7 | Client surface | Client dashboard section, `client_visible` only, checkClientMbaAccess-scoped | Smoke as client |
| P7-8 | Benchmarks admin | PLANNING_CHANNEL_BENCH edit surface (admin-only) | Seed initial values |

## 6. Decisions
- D1 Snowflake facts + Xano audiences — CONFIRMED. D2 route stays /tools — CONFIRMED.
- D3 API roles admin+manager. D4 benchmark values seeded by Luke, admin-editable.
- D5 wave loader run manually per RM wave. D6 acceptance workbook/cells — OPEN (Luke picks).
- D7 segments editable as data — CONFIRMED. D8 PPTX template — OPEN.
- D9 client visibility per-audience toggle default OFF — CONFIRMED.

## 7. Definition of done
A planner picks Metro / VIC+NSW / 25–54, sees an audience size matching the workbook's own
tabulation (D6 acceptance), gets a BCS-ranked channel profile with real RM affinities,
saves it to a client, exports the deck, and the client sees the published version on their
campaign page.

---

## 8. P7-0 RECONCILIATION — prototype engine ↔ Roy Morgan data (2026-07-11)

Discovery finding: the engine (`lib/bcs-engine.ts`) consumes a static channel catalogue
(`aff` by segment, `ageSkew`, `genderSkew`, `attn`, `B`, `D`, `cpm`) plus `GEO_POP`
heuristics — not reach curves. The split is clean and BOTH halves survive:

### 8.1 Where each engine input comes from (the law for P7-2/P7-3)

| Engine input | Source of truth | Derivation |
|--------------|-----------------|------------|
| `audience_size` | PLANNING_FACT_REACH | Σ wc over selected cells (POPULATION channel rows) |
| `aff[segment]` (affinity index) | PLANNING_FACT_REACH | composition index: channel reach% in audience ÷ channel reach% in national base × 100 |
| `age_fit` / `gender_fit` | PLANNING_FACT_REACH | derived from the channel's demo-cell distribution vs the selected cells (replaces ageSkew/genderSkew maths server-side) |
| reach% (UI metric) | PLANNING_FACT_REACH | direct — replaces the `A*0.85` fiction and the 82% cap |
| `attn`, `B`, `D`, `cpm` | PLANNING_CHANNEL_BENCH | admin-maintained benchmarks (NOT RM — badge in UI); seeded from current lib/data.ts values as the starting draft |
| `weights`, `objective`, `budget`, allocation | client-side | unchanged — the BCS formula and `allocate` stay (calibration is a product task, not a build task) |
| Search / Retail channels | PLANNING_CHANNEL_BENCH only | `is_rm_measured = false` → affinity defaults to 100 (neutral), scored on benchmarks; UI badges "Source: Assembled seed — pending warehouse source" |
| CULTURAL_MOMENTS | stays seeded | deferred; not scored; revisit post-v1 |
| AvaNarration | stays deterministic | LLM later |

### 8.2 Channel identity map
`PLANNING_DIM_CHANNEL.engine_channel_id` ↔ the prototype's `Channel.id` (`tv`, `bvod`, …).
RM taxonomy rows aggregate up to engine channels via this map (loader maintains it; unknown
RM rows are reported, never guessed).

### 8.3 LOCKED API response for `POST /api/planning/audience`
(blesses the discovery's §3 inferred shape, extended):

```ts
{
  wave_id: string;
  audience_wc: number;              // '000s
  suppressed_cells: number;
  channels: Array<{
    engine_channel_id: string;      // maps to Channel.id
    reach_pct: number;              // real RM reach
    affinity_by_segment: Record<string, number>;  // index, 100 = baseline
    age_fit: number;                // 0..1
    gender_fit: number;             // 0..1
    is_rm_measured: boolean;
    bench: { attn: number; brand_effect: number; direct_effect: number; cpm: number };
  }>;
}
```

### 8.5 → see §9 for the verified wave-1 pack and Phase-1 scope trim (2026-07-11)

### 8.4 P7-3 rewire consequences (from the discovery verdict table)
- keep: page shell, PlannerForm, Brief/Objective/Weights cards, sliders, MixTable, BcsBadge, MetricCards, bcs-engine formula
- rewire: AudienceCard (options + size from /meta + /audience), ResultsPanel (fetch + loading/error states), types.ts (DTOs + engine_channel_id), AvaNarration (unchanged fallback)
- replace (data only): CHANNELS aff/skews/GEO_POP → API; attn/B/D/cpm → benchmarks via API
- non-binary gender: RM doesn't model it; UI keeps the option, server treats as "all" with a note (product can revisit)

---

## 9. PHASE 1 — verified wave pack + scope trim (Luke, 2026-07-11)

### 9.1 Scope trim
Phase 1 is deliberately light for multi-stakeholder feedback: **audience (demo/geo) +
key audience segments + channel reach + BCS mix**. Dropped from phase 1: attitudes,
activities-done dimensions (not in the pack), cultural moments (already deferred),
provider-level channel detail (not in the pack). Weights/objective/budget stay (engine).

### 9.2 Wave-1 pack — VERIFIED against the 8 delivered workbooks
- Files: `all people.xlsx` (Base) + `media cap cities` (Metro), `media grocery buyers`,
  `media heath and home`, `media high income`, `media leading lifestyles`,
  `media metrotechs`, `media aspirationals`.
- Sheets per workbook: `All cases` (→ NAT), `NSW`, `Vic`, `Qld`, `SA`, `WA`, `Tas`,
  `Dar-Alce` (→ NT).
- Wave id: cell A74 `MAR26E1_ASM`. Weights: "Projected p..." (population '000s).
- Columns (41): group headers on sheet row 9; wc/v% pairs on row 14+. DISCRETE cells
  loaded: Men/Women × 14-24, 25-34, 35-49, 50-64, 65+ (10 cells). Validation-only:
  TOTAL, TOTAL 50+, TOTAL 18+, TOTAL Men/Women, ALL PEOPLE 14+, SEX block.
- Rows: `(unweighted)` r11 (base-size check), `(POPN '000)` r12 (POPULATION row),
  block 1 `MEDIA CHANNELS - ADDRESSABLE REACH` r16–r41, block 2
  `MEDIA CHANNELS - TOTAL REACH` r44–r69 — same 26-channel taxonomy in both:
  Video (Total/FTA/BVOD/PayTV/SVOD/YouTube18+), Audio (Total/Radio/Streaming/Podcasts),
  News (Total/Print/Digital), Magazines (Total/Print/Digital), Outdoor (Total/Street
  Furniture/Billboards/Shopping Centres/Transit), Social (Total/Facebook/Instagram, 18+),
  Cinema, Other Digital Content Sites.
- 18+ base channels: YouTube, Social Total/Facebook/Instagram → `age_base = 18`; the
  builder shows a caveat badge when the selection includes 14-24.
- Addressable vs Total reach: loaded as paired measures; the builder exposes a
  reach-basis toggle (default: Addressable for digital-buyable planning).

### 9.3 Loader acceptance (P7-1)
- Row/column positions are anchored by LABELS not indices (header text match), so future
  waves tolerate small layout drift; unknown channel labels are REPORTED, never guessed.
- Validation report per workbook: national wc ≈ Σ(state wc) per channel (tolerance),
  v% recomputed from wc within tolerance, unweighted cell floor report (thin bases),
  wave id consistency across all 8 files.
- D6 acceptance candidate: Metro (cap cities) / NSW+Vic / 25-54 / all — verify the app
  reproduces the workbook tabulation for those cells.

---

## 10. v1.1 — Demand-Flow workflow redesign (Luke's HTM prototype, 2026-07-11)

Adopt the staged workflow from the approved HTML prototype, reconciled with the laws:

- **Stage A — Brief:** CLIENT DROPDOWN (existing /api/clients), campaign name, START/END
  DATES, category (picklist), market, budget, objective cards (each carries a
  Create:Capture preset that maps onto the existing BCS objective/weights).
- **Stage B — Audiences (up to 3, compared):** per audience: name + colour, ONE segment
  lens (single-select — replaces the prototype's stackable layers per non-additivity law),
  states, gender, age bands, reach basis. Live panel: audience size (wc), % of 14+
  universe, ROBUSTNESS SIGNAL from unweighted counts (n = Σ unweighted over selected
  POPULATION cells; <75 bad / <200 warn / else robust), top-affinity mini profile.
  Attitudes: OUT (phase 1 trim).
- **Stage C — Demand diagnosis:** penetration/target sliders, salience, Create↔Capture
  slider → weight presets (engine params from PLANNING_ENGINE_PARAMS).
- **Stage D — Constraints:** channel include/exclude chips (client-side filter).
- **Stage E — Compare & plan:** per-audience cards (size, n, lead channel, top-3 mix) +
  channel-mix comparison table (weight bars per audience colour, reach + indicative $
  per cell, lead dot). Sources chips row (Roy Morgan wave real; benchmarks badged
  Assembled; create:capture shown). "Use audience →" = P7-4 handoff (save to Xano +
  create-campaign prefill).
- **Methodology transparency:** "How we calculate" panel rendering PLANNING_METHODOLOGY
  rows (Snowflake-editable); PLANNING_ENGINE_PARAMS drives tunable coefficients via /meta.
- **Data addition (DONE in loader):** PLANNING_FACT_REACH.UNWEIGHTED on POPULATION rows.

Build split: **R1** workflow shell + brief + multi-audience compare + robustness signal.
**R2** methodology panel + engine-params-from-table + Use-audience handoff (absorbs P7-4).
