# FN-FIX-1 — Receivables legacy-vs-sections recon dispositions

Status: live recon run 2026-08-01 (FY2026 `2026-07`→`2026-08`)  
Command: `npm run recon:finance-sections-summary`

## Totals

| Source | Receivables FYTD |
|--------|------------------|
| Legacy blob hub (`getFinanceHubScheduleFytdTotals` version pool) | $2,236,498.04 |
| Sections PG (`published_version_id` + `schedule_months` billing) | $2,235,839.11 |
| **Delta (sections − legacy)** | **−$658.93** |

**Attribution of −$658.93:** net of the 19 non-zero per-MBA deltas below (sum \|Δ\| = $75,112.33; signed net = −$658.93). Not a single-MBA bug — residual of version-pool vs published-tip + schedule materialisation mismatches.

## Per-MBA dispositions

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

**Recommended:** accept **published tip + `schedule_months`** as receivables authority (sections). Treat D1/§E deltas as expected during cutover; do not force sections to mimic the legacy “booked/approved among ≤published else highest” pool.

Until signed: Costs banner stays up; UX-* / F5.3 / F10.* / CF1 remain **fixed pending live verification**.
