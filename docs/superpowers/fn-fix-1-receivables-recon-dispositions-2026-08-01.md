# FN-FIX-1 — Receivables legacy-vs-sections recon dispositions

Status: live recon run 2026-08-01 (FY2026 `2026-07`→`2026-08`), post CP-3 status scoping  
Command: `npm run recon:finance-sections-summary`

## What each side measures

| Side | Source | Basis | Components | Status scope | Client-pays | Version authority |
|------|--------|-------|------------|--------------|-------------|-------------------|
| **legacy_blob_hub** | Xano `billingSchedule` / `billing_schedule` blobs via recon `legacyReceivablesByMba` | billing (blob months) | `sumLineItems` over schedule month entries (media+fee+adserving dollars rolled into month total) | Prefers `booked\|approved\|completed` among versions ≤ published; **falls back** to `pickHighestVersionRow` (draft/planned/cancelled tips can enter) | Not filtered (AR path) | Version **pool** ≤ `master.version_number`, not forced to `published_version_id` tip |
| **sections_pg** | Postgres `schedule_months` via `receivablesFytd` / `receivablesSqlText` | `basis = 'billing'` | `component IN ('media','fee','adserving')` | **Hard filter** `approved\|booked\|completed` (`FINANCE_STATUS_INCLUDED_SQL`) | Not filtered (AR path; client-pays is payables/delivery only) | `m.published_version_id` tip only |

## Totals (post CP-3)

| Source | Receivables FYTD |
|--------|------------------|
| Legacy blob hub | $2,236,498.04 |
| Sections PG (status-scoped) | $1,605,886.42 |
| **Delta (sections − legacy)** | **−$630,611.62** |

### Decomposition of −$630,611.62

| Bucket | AUD | Notes |
|--------|-----|-------|
| **excluded-status** | **$629,952.69** | PG published-tip billing by status (same window): draft $343,119.57 + planned $216,618.07 + cancelled $70,215.05. In sections; out of `receivablesFytd`. Legacy still counts many of these via highest-version fallback. |
| **client-pays** | $0.00 | N/A on receivables (no `client_pays_for_media` filter on either AR path). |
| **fee / adserving** | $0.00 of Δ | Both sides include fee+adserving on billing; not a signed driver of this Δ. |
| **orphan** | $0.00 of Δ | Payables/delivery join concept; not used on AR. |
| **Remainder** | **$658.93** | Equals legacy − (sections_pg + excluded-status) = $2,236,498.04 − ($1,605,886.42 + $629,952.69). Does **not** fully decompose into the four named buckets above. |

**STOP:** remainder **$658.93** is the pre-CP-3 FN-FIX-1 residual (version-pool vs published-tip + schedule materialisation). Per-MBA table below is that residual’s disposition ledger (when both sides were status-comparable at ~$2.235M).

## Historical residual (−$658.93) per-MBA dispositions

When sections PG was **not** status-filtered, totals were legacy $2,236,498.04 vs PG $2,235,839.11 (Δ −$658.93). Attribution: net of the 19 non-zero per-MBA deltas below (sum \|Δ\| = $75,112.33; signed net = −$658.93).

| MBA | Legacy | PG | Δ | Disposition |
|-----|--------|-----|---|-------------|
| krusty012 | $0 | $25,000.00 | +$25,000.00 | **D1 version pool** — PG published tip has billing months; legacy pool picked empty/other tip |
| cuheal001 | $10,000.00 | $18,857.14 | +$8,857.14 | **D1 tip / schedule shape** — published tip amount differs from legacy selected version |
| glenda008 | $48,774.72 | $40,730.77 | −$8,043.95 | **D1 tip / schedule shape** — same class |
| test123001 | $5,530.00 | $0 | −$5,530.00 | **§E / empty schedule_months** on published tip; blob still has months |
| legal004 | $20,873.00 | $16,723.00 | −$4,150.00 | **D1 tip / schedule shape** |
| candel001 | $20,000.00 | $16,100.00 | −$3,900.00 | **D1 tip / schedule shape** |
| jayco001 | $37,984.00 | $34,185.60 | −$3,798.40 | **D1 tip / schedule shape** (often 10% fee-slice class) |
| krusty004 | $43,804.34 | $47,173.90 | +$3,369.56 | **D1 tip / schedule shape** |
| letsgo001 | $30,586.00 | $27,527.40 | −$3,058.60 | **D1 tip / schedule shape** |
| PGAAUS014 | $10,797.50 | $8,638.00 | −$2,159.50 | **D1 tip / schedule shape** |
| 001001 | $14,000.00 | $11,900.00 | −$2,100.00 | **D1 tip / schedule shape** |
| candel002 | $8,000.00 | $6,400.00 | −$1,600.00 | **D1 tip / schedule shape** |
| letsgo002 | $10,000.00 | $9,000.00 | −$1,000.00 | **D1 tip / schedule shape** |
| buxton001 | $14,148.00 | $13,318.00 | −$830.00 | **D1 tip / schedule shape** |
| jayco003 | $7,108.88 | $6,398.00 | −$710.88 | **D1 tip / schedule shape** |
| BICAU003 | $5,833.34 | $5,250.00 | −$583.34 | **D1 tip / schedule shape** |
| letsgo006 | $3,000.00 | $2,700.00 | −$300.00 | **D1 tip / schedule shape** |
| jayco015 | $2,800.00 | $2,700.00 | −$100.00 | **D1 tip / schedule shape** |
| PGAAUS003 | $104.82 | $83.86 | −$20.96 | **D1 tip / schedule shape** |

## Luke match-or-decide

**Recommended:** accept **published tip + `schedule_months` + CP-3 status scope** as receivables authority (sections). Treat excluded-status $629,952.69 as intentional CP-3 behaviour; treat the $658.93 remainder as expected D1/§E cutover residual (do not force sections to mimic the legacy pool).

Until signed: Costs banner stays up; UX-* / F5.3 / F10.* / CF1 remain **fixed pending live verification**.
