# KPI re-verification — new channels (Taboola / ad-serving / Direct)

**Date:** 2026-07-11  
**Scope:** Discovery + trivially-safe ratio-scale fixes. Structural gaps reported only.

---

## 1. How targets reach each surface

`CampaignPageAssembly` loads `campaign_kpi` once and builds **two** maps:

| Map | Key | Consumers |
|-----|-----|-----------|
| `lineItemTargets` (`buildLineItemKpiTargetMap`) | `mba\|version\|line_item_id` | Delivery KPI tiles (CTR/VTR/CVR expected) via `getLineItemKpiRow` |
| `kpiTargets` (`KPITargetsMap`) | `media_type::publisher::bid_strategy` | Deliverable **target curves** (`buildCumulativeTargetCurve`) when metric is clicks/views |

Line-item keying is platform-agnostic (`lib/kpi/lineItemKpiTargets.ts`). No DV360/Taboola filter on KPI fetch or join.

### A. Programmatic delivery (Taboola included)

- Plan allowlist in `lib/delivery/programmatic/programmaticCompute.ts` includes `taboola` / `native - taboola` / `native`.
- KPI tiles: `programmaticAdapterShared` → `getLineItemKpiRow` + `normaliseRatioTarget`.
- Deliverable progress cards: **plan bursts vs PACING_FACT** — not `campaign_kpi`.
- Line-item curve `onTrackStatus` uses tuple `kpiTargets` only for clicks/views buys; typical Taboola CPM → impressions → `no-data` by design.
- Pacing shell: `fetchProgrammaticPacingCampaignRows` joins the same `mba|version|line_item_id` key; status uses `normaliseRatioTarget`.

### B. Ad-serving adapter + pacing deliverable progress

- CTR expected: `lineItemTargets` + `normaliseRatioTarget`.
- Deliverable progress: plan burst `calculatedValue` vs CM360 actuals — **not** `campaign_kpi`.
- No tuple `kpiTargets` curve on this adapter.

### C. Direct tab

- **No `campaign_kpi` path.** Expected deliverables come only from Snowflake `FIXED_COST_*` facts (`BURST_EXPECTED_DELIVERABLES` / actuals / ratio).
- **Conflict with KPI rows?** No — the two models never meet on this surface.

---

## 2. Taboola KPI resolution

| Surface | Resolves Taboola KPI target? | Notes |
|---------|------------------------------|-------|
| Dashboard programmatic KPI tiles | **Yes** (if row exists) | Platform gates section membership only |
| Dashboard programmatic deliverable progress | N/A for `campaign_kpi` | Plan bursts vs actuals |
| Ad-serving CTR | **Yes** (same line-item key) | |
| Pacing programmatic table | **Yes** | No DV360 filter |
| Direct | N/A | No KPI join |

**Verdict:** No DV360-conditional filtering of KPI targets on the join path.

---

## 3. Ratio-scale / `normaliseRatioTarget` (f8ba9a6)

Helper: `lib/kpi/normaliseRatioTarget.ts` — legacy `>= 1` → divide by 100 (percentage-points → decimal).

| Path | Applied? |
|------|----------|
| Programmatic / social delivery KPI tiles | Yes |
| Ad-serving CTR tiles | Yes |
| Programmatic / social pacing status | Yes |
| **Target curve `rateForMetric`** | **Was missing → fixed this run (S)** |
| **Search pacing `buildKpiComparisons`** | **Was missing → fixed this run (S)** |

---

## 4. Verdict table

| Surface | Target resolution OK? | Actuals aligned? | Fix |
|---------|----------------------|------------------|-----|
| Dashboard programmatic KPI tiles (incl. Taboola) | Yes | Yes | None |
| Dashboard programmatic deliverable progress | Plan bursts OK | PACING_FACT OK | Curve scale: **S** (shipped) |
| Pacing programmatic KPI status | Yes | Yes | None |
| Ad-serving CTR + deliverables | CTR yes; deliverables = plan | Scale OK | None |
| Direct expected deliverables | FIXED_COST only | Facts model | No KPI conflict; wiring KPI would be **M+** |
| Search pacing KPI status | Join OK | Was broken for legacy %-point targets | **S** (shipped) |
| Search delivery tiles / curves | Tuple map / schedule-derived | Curve scale gap | Curve: **S** (shipped); line-item CTR wiring = **M** if desired |

---

## 5. Fixes shipped in this run

1. `lib/kpi/deliveryTargetCurve.ts` — `rateForMetric` calls `normaliseRatioTarget` for CTR/VTR.
2. `lib/pacing/kpi/computeKpiStatus.ts` — `buildKpiComparisons` normalises CTR / conversion-rate targets.

**Not shipped (structural):** dual-map publisher/bid vs line_item_id mismatch; Direct↔KPI merge; search delivery line-item CTR tiles.

---

## 6. Key files

- `lib/kpi/lineItemKpiTargets.ts`, `deliveryTargetCurve.ts`, `normaliseRatioTarget.ts`
- `components/dashboard/delivery/channels/programmaticAdapterShared.ts`, `adServingAdapter.ts`
- `lib/delivery/programmatic/programmaticCompute.ts`
- `lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows.ts`, `computeProgrammaticKpiStatus.ts`
- `lib/pacing/kpi/computeKpiStatus.ts`
- `lib/pacing/direct/fetchDirectPacingRows.ts`
