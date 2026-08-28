# Forecast gap discovery — F10 (billing & revenue forecasting)

**Date:** 2026-07-11  
**Mode:** Read-only. No build.  
**Target product (FY27 tracker):** FORECAST layer (client × revenue-line × month) + NEW-BUSINESS pipeline vs BOOKED (schedules / Xero) with variance.

---

## 1. Existing forecast module (end-to-end)

### What “forecast” means today

| Aspect | Reality |
|--------|---------|
| Meaning | **Derived booked projection** for an Australian FY — not a planning target |
| Inputs | `media_plan_versions` schedules, `get_clients` fees/retainer, `get_publishers` commission rates |
| Manual cells | **None** — UI is read-only |
| Scenarios | Confirmed = booked/approved/completed; Confirmed+Probable = non-cancelled |
| Xero | **Not used** in `lib/finance/forecast/**` |
| Persist | Immutable **snapshots** only |

Amount priority per month: billingSchedule → deliverySchedule → bursts (`buildFinanceForecastDataset.ts`).

### Data flow

```
Xano versions + clients + publishers
  → loadFinanceForecastDataset
  → buildFinanceForecastDataset
  → GET /api/finance/forecast → FinanceForecastPanel
  → POST snapshots → finance_forecast_snapshots + _lines
  → POST variance → compareFinanceForecastSnapshots (A vs B over time)
```

### Line taxonomy (current)

**Billing:** AA vs AM publisher billing.  
**Revenue:** `search_social_20pct`, `direct_managed_digital_40pct`, `commission`, `service_fee_digital`, `fixed_price_gtd`, `retainer`, `project_scope_prip` (zeros), `total_revenue`.

Labels say “20%/40%” but rates come from **data**. Classification buckets: `search_social` | `direct_managed_digital` | `commission_other`.

### Snapshots & variance

- Snapshots = point-in-time copy of the **calculated booked** dataset.
- Variance engine = **snapshot A vs snapshot B** (time drift), not booked vs target.
- Grain: `client × version × line_key × month_key`.
- FY framing (Jul→Jun) is solid and reusable.

---

## 2. Gap table vs tracker

| Tracker capability | Existing? | Gap | Reuse? |
|--------------------|-----------|-----|--------|
| Target-entry grid (client × month × revenue-line) | No | Full CRUD + editable UI | FY months, panel chrome |
| Revenue-line taxonomy (“Direct to AA - 8%”, “Search & Social - x%”) | Partial | No “Direct to AA - 8%” as fee tier; AA today is **billing media** | Extend line keys / definitions; keep classification for booked |
| Manual / planned amounts | No | Mutable store | — |
| NEW-BUSINESS pipeline | **Nothing** | New entity + API + UI | Weighted = greenfield formula |
| BOOKED layer | Yes (this module) | Optional Xero later | Current dataset ≈ booked from schedules |
| Variance booked vs target | No (only snapshot↔snapshot) | New compare path | **Yes** — `varianceEngine` if keys align (`client + line_key + month`) |
| FY framing | Yes | Align with hub FY switcher (F2) | As-is |
| Export | Booked only | Target + pipeline + variance exports | `exportFinanceForecast` pattern |

### Taxonomy proximity

| Tracker-ish label | Closest existing | Match |
|-------------------|------------------|-------|
| Search & Social - x% | `search_social_20pct` | High |
| Direct managed digital | `direct_managed_digital_40pct` | Medium |
| Direct to AA - 8% | AA **billing** line | Low — different concept |
| Retainer / project / GTD | existing keys | Partial / incomplete |

---

## 3. Data-home recommendation

**Recommend new Xano tables — do not overload snapshot tables.**

| Store | Purpose | Mutability |
|-------|---------|------------|
| `revenue_forecast_lines` | Target amounts (client, FY, line_key, month, amount, audit) | Mutable CRUD |
| `new_business_pipeline` | Prospects + weighted fields | Mutable CRUD |
| `finance_forecast_snapshots` (+ lines) | Point-in-time **booked-derived** audit | Immutable INSERT-only |

**Why not extend snapshots:** documented immutable calculated copies; grain includes `media_plan_version_id`; mixing targets breaks A-vs-B time variance; pipeline is deal-level, not month-line.

**Booked side:** keep `loadFinanceForecastDataset` (schedules). Xero as a future booked source, not the target store.

---

## 4. Build sequence

### F10-1 — Target grid (~M / 1.5–2.5 weeks)

- Xano `revenue_forecast_lines` + `/api/finance/forecast/targets`
- Host: extend `FinanceForecastPanel` (Booked vs Target toggle)
- Depends on: product sign-off on line catalog vs existing keys

### F10-2 — New-business pipeline (~M / 1–2 weeks)

- Xano `new_business_pipeline` + `/api/finance/forecast/pipeline`
- Host: section/sub-tab under Forecast hub tab
- Weighted income computed client- or server-side

### F10-3 — Variance dashboard + export (~M / 1.5–2 weeks)

- Adapt `compareFinanceForecastSnapshots` / `varianceCore` for booked vs target
- Route e.g. `POST /api/finance/forecast/variance/booked-vs-target`
- Extend `FinanceForecastVariancePageClient`; link from Forecast panel
- Export shaped like the tracker

**Order:** F10-1 establishes grain → F10-2 orthogonal commercial upside → F10-3 needs booked (exists) + target (F10-1).

---

## 5. Open product questions

1. Is “Direct to AA - 8%” a fee on AA-billed media, a fixed fee tier, or something else?
2. Should target `line_key`s equal booked keys, or a separate catalog mapped for variance?
3. Is booked truth **schedules** (current) or **Xero** for FY27 variance?
4. Does pipeline weighted income roll into the monthly grid or stay deal-level only?

---

**Bottom line:** Strong **booked FY projection + snapshot audit** foundation. Tracker FORECAST + PIPELINE + booked-vs-target is mostly **net-new data + editable UI**, with classification/FY/variance math as reusable scaffolding — not a small extension of snapshot tables.
