# Pacing + Finance hub consistency (P2)

**Date:** 2026-07-26  
**Status:** Approved — implement  

**Depends on:** P0/P1 landed (honest as-of, in-memory pacing filters, finance multi-month / deferred hero states)  
**Approach:** Approach 1 — extract + thin adapters; no shared channel page shell; no generic `StatTile`

## Problem

Pacing channel tabs and Finance hub panels share filter stores and status maths with Overview / billing routes, but the UI is inconsistent: channel tabs lack the Overview status strip, finance status + billing-type filters are wired but hidden, ad-hoc loading/error markup diverges from shared states, and pacing tables need a presentation-only polish pass. No data-correctness change.

## Guardrails

1. **Cosmetic / additive only** — no change to refetch keys, filter semantics, billing/payables derivation, or finance hero KPI deferred/loading logic (P0‑2 stays untouched).
2. **No `StatTile`** — aspirational shorthand only. Primitives are `Panel` / `PanelHeader` (`components/layout/Panel.tsx`), `EmptyState` / `LoadingState` / `ErrorState` (`components/ui/states.tsx`), plus extracted `PacingStatusSummary`.
3. **Client-safe Overview mappers** — confirmed: `mapOverviewItems.ts`, overview `types`, `maths`, and `computeKpiStatus.ts` have no `server-only`. `buildOverviewPayload.ts` stays server-only; clients must not import it.
4. **Table pill ≠ Overview band** — channel `lineItemStatus` collapses `slightly_over` and `over_pacing` → `"ahead"`. Six-state counts require re-running Overview mappers on filtered rows, not tallying table pills.
5. **Fidelity test = fixed-row-set equivalence** — not live Overview vs live channel tab (portfolio scope + pagination differ by design).

## Confirmed component paths

| Need | Path |
|------|------|
| Panel chrome | `components/layout/Panel.tsx` (`Panel`, `PanelHeader`, `PanelTitle`, `PanelDescription`, `PanelActions`, `PanelContent`) |
| Empty / loading / error | `components/ui/states.tsx` |
| Status strip (new extract) | `components/pacing/PacingStatusSummary.tsx` |
| Overview source UI (today) | local `StatusSummary` in `app/pacing/(shell)/overview/OverviewClient.tsx` |
| Overview mappers | `lib/pacing/overview/mapOverviewItems.ts` |
| Search KPI pending | `lib/pacing/kpi/computeKpiStatus.ts` → `computeRowKpiStatus` |
| Finance toolbar | `components/finance/FinanceFilterToolbar.tsx` |

---

## §1 Status row

### Extract

Move Overview’s local `StatusSummary` into `components/pacing/PacingStatusSummary.tsx`.

- Props: `counts: OverviewStatusCounts`
- Layout/tones unchanged (Behind / On track / Ahead / Over-pacing / No data / KPI Pending)
- Overview imports the shared component — **behaviour-preserving**, byte-identical counts row
- Insurance: snapshot/DOM test on the Overview counts row after extraction

### Per-channel counts

After in-memory filters, on each channel client, map **filtered** rows with the same branches Overview uses inside `buildOverviewPayload` (mirror logic; do not call `buildOverviewPayload`):

| Channel | Mapper | Input notes | `kpiPending` |
|---------|--------|-------------|--------------|
| Search | `mapSpendRowToOverviewItem("search", …, asOfDate)` | Real conversions / revenue from row | Count rows where `computeRowKpiStatus(row) === "kpi-pending"` |
| Social | `mapSpendRowToOverviewItem("social", …, asOfDate)` | `conversions: 0`, `revenue: 0` | `0` |
| Programmatic | `mapSpendRowToOverviewItem("programmatic", …, asOfDate)` | `conversions: 0`, `revenue: 0` | `0` |
| Direct | `mapDirectLineToOverviewItem` per line item | Pass `burstStatuses` from bursts | `0` |
| Ad serving | `mapAdServingRowToOverviewItem` | Existing serving / no-data map | `0` |

Then `summarizeOverviewItems(items, kpiPending)` → `<PacingStatusSummary counts={…} />` above the channel table.

Pure helpers (e.g. `lib/pacing/overview/countChannelOverviewStatus.ts` or per-channel thin wrappers) — no React, no server imports. Clients stay thin.

### Fidelity test (wording)

**Derivation-equivalence on a fixed row set:** given fixture rows + as-of, the per-channel counter produces the **same** `OverviewStatusCounts` as mapping those same rows through the Overview mapper(s) + `summarizeOverviewItems` (and search KPI-pending increment).

Do **not** assert live Overview API counts == live channel-tab counts. Overview is portfolio-scoped and paginated (`resolveOverviewClientScope` + `inPortfolio`); a channel tab shows the full cached channel set for the user’s slugs. Those surfaces may differ; that is not a bug.

---

## §2 Finance filters

Surface existing store fields in `FinanceFilterToolbar`. Additive; Apply / Reset / Load / receivables bump unchanged. No API or store shape changes. **Hero KPI tiles out of scope.**

### Decisions (locked)

#### Billing type — tab-scoped; only where it drives output

Pass `activeTab` into the toolbar. Options are always a subset of typed `BillingType` — never invent values.

| Tab | Billing-type control |
|-----|----------------------|
| `billing` (Client Billing) | Show **`media` / `sow` / `retainer` only** — never offer `payable` |
| `overview`, `accrual`, `report` | Same receivable options (`media` / `sow` / `retainer`) — these tabs consume hub-fetched billing records |
| `payables` (Publisher Invoices) | **Omit** (type is always payable) |
| `forecast`, `queue` | **Omit** — confirmed inert (`FinanceForecastPanel` only reads `financialYear`; Xero Queue does not read `billingTypes`) |

Values shown = intersection of `draft.billingTypes` with the options for that tab. On change, **merge** — write the selected receivable types into `draft.billingTypes` alongside any out-of-tab values already there (e.g. `payable`), which are preserved, never clobbered and never inserted by this control (existing Apply path).

Empty / “all selected” behaviour matches other toolbar multiselects (`emptyMeansAll`), with one qualification: an empty intersection only reads as “All” when the whole draft array is empty. An empty intersection with out-of-tab values still applied is a real narrowing filter and shows the placeholder instead. Defaults unchanged at store level.

#### Status — tab-scoped to statuses that can appear; toggle owns drafts

**Do not** dump the full `BillingStatus` union (that reintroduces dead-option → silent empty, same class as payable-on-Client-Billing).

**Evidence:**
- Receivable derivation (`deriveReceivableRecords` / SOW / retainer) emits `booked` or `draft` (campaign `approved`/`completed` map to record `booked`).
- Product filter vocabulary already used as “all” for receivables = store default minus draft = Overview `KPI_RECEIVABLE_STATUSES`: **`booked`, `approved`, `invoiced`, `paid`**.
- Payables derivation emits `expected`; Overview `KPI_PAYABLE_STATUSES` = **`expected`, `invoiced`, `paid`**.
- `cancelled` / `disputed` are typed but are **not** in the shipped receivable default and are not emitted by receivable derivation — do not offer them on Client Billing.

| Tab | Status control options |
|-----|------------------------|
| `billing`, `report` | `booked`, `approved`, `invoiced`, `paid` |
| `payables` | `expected`, `invoiced`, `paid` |
| `overview`, `accrual` | Union of both (these panels consume billing **and** payables): `booked`, `approved`, `invoiced`, `paid`, `expected` |
| `forecast`, `queue` | **Omit** (same inert tabs as billing-type) |

- **Never** expose `draft` — `includeDrafts` Switch + `include_drafts=0` remain the sole draft gate
- Displayed values = intersection of `draft.statuses` with that tab’s options; on change, **merge** the selected list for that tab with the out-of-tab statuses already in the draft (e.g. `expected` survives an edit on Client Billing). The control replaces only the values it can offer; it preserves everything else and inserts nothing — in particular it never re-inserts `draft`, though a `draft` already present is left alone for the `includeDrafts` gate to handle
- “All selected” display follows the same rule as billing type: only an entirely empty `draft.statuses` reads as “All”. An empty intersection with out-of-tab statuses still applied shows the placeholder

### Out of scope for §2

Changing default `FinanceFilters`, saved-view migration, or rewriting how routes interpret empty vs full type/status arrays.

---

## §3 Panel chrome

Behaviour-preserving swap only:

- **Pacing channel clients:** replace ad-hoc Skeleton / destructive error text with `LoadingState` / `ErrorState` / `EmptyState` (and filter-empty via existing `PacingFilterEmptyState` where that is the product copy). Wrap titled table sections in `Panel` / `PanelHeader` when appropriate. **Sticky filter toolbar stays outside `Panel`.**
- **Finance panels:** normalize remaining ad-hoc empty/loading/error to shared states; use `Panel` / `PanelHeader` for titled sections that are not already consistent.
- **Do not** rebuild or retouch finance hero KPI tiles.

---

## §4 Table polish (presentation only)

Per existing channel table (~5 files). **No** shared column-visibility hook (Approach 2 deferred).

| Treatment | Rule |
|-----------|------|
| Quiet cells | No border at rest |
| Sticky columns | **Client + Campaign** only |
| Numerics | Right-aligned `.num` |
| Status | RAG-tinted `Badge` variants (existing) |
| Default columns | Static per-channel list; **always keep decision-critical columns visible:** client, campaign, status, budget, spend/pacing. Only secondary columns (platform / line-item IDs, dates, targeting, etc.) go behind **More columns** |
| More columns | Local component state toggle only — no persistence this pass |
| Updating… | Pending / deferred-apply visual on filter change only — **no** change to refetch or in-memory filter behaviour |
| Toolbar | Sticky toolbar remains |

---

## §5 Verify

- Overview counts-row snapshot / DOM test after `PacingStatusSummary` extraction
- Fixed-row-set derivation-equivalence test for each channel counter (§1 wording)
- Visual parity: finance panels + pacing tabs use shared Panel/states chrome; status strip matches Overview strip
- Finance: billing-type / status options tab-scoped per §2 (no payable on Client Billing; no dead statuses; controls omitted on Forecast/Xero Queue; `draft` never in status multiselect; includeDrafts still gates drafts)
- No behavioural/data regression: pacing refetch keys, filter apply, billing/payables params, hero KPI deferred logic unchanged
- Manual smoke: filter pacing → summary tracks filtered rows and Over-pacing ≠ Ahead collapse; toggle finance status / billing type → results honest, not silently empty

## Out of scope (P2)

- `PacingChannelPageShell` / shared column-visibility hook
- Generic `components/ui/StatTile`
- Finance hero KPI redesign
- Persisted column preferences
- Changing Overview portfolio scope or channel cache semantics
- Snowflake / as-of maths changes

## Implementation note

After spec approval → writing-plans → implement. Prefer small reviewable commits: (1) extract + fidelity tests, (2) channel summary wiring, (3) finance toolbar filters, (4) panel chrome, (5) table polish.
