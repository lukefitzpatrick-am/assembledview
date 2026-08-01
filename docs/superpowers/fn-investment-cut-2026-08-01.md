# FN — Investment cut aggregation endpoint

Status: complete (endpoint + tests + live recon)

## Contract

`POST /api/finance/sections/investment/cut` — admin-gated (`requireFinanceAdmin`).

```json
{
  "fy": 2025,
  "monthRange": { "from": "2025-07", "to": "2026-06" },
  "basis": "billing" | "delivery",
  "dimensions": ["client", "channelGroup", "channel", "publisher", "buyType", "market", "month", "fy", "billingAgency"],
  "measures": ["media_cents", "fee_cents", "adserving_cents", "billable_cents"],
  "filters": {
    "clients": [],
    "channels": [],
    "channelGroups": [],
    "publishers": [],
    "buyTypes": [],
    "markets": [],
    "billingAgency": ["AA", "AM"],
    "search": ""
  }
}
```

Response: `rows[]` (dim values + measure cents), `totals` (full-scope cents, independent of row cap), `coverage` `{ publisherMatchedPct, rowCount, scope, basis, fee? }`, `truncated`, `rowCap` (5000), `_debugSql` for MCP re-run.

Hard rules: cents only; one basis per response; deterministic `ORDER BY` dims ASC then billable DESC; never silent truncate.

### channelGroup (proposed — sign-off)

| Group | `line_channel` values |
|---|---|
| Broadcast | television, radio, cinema |
| Print | newspaper, magazines |
| OOH | ooh, prog_ooh |
| Digital Direct | digi_display, digi_video, digi_audio, digi_bvod |
| Programmatic | prog_display, prog_video, prog_audio, prog_bvod |
| Search | search |
| Social | social |
| Content | influencers, integrations |
| Production | production |

Publisher dim = FN0 `PUBLISHER_IDENTITY_SQL`; null → **Unmatched**. `billingAgency` = `classifyBillingAgency` twin over `publishers` name join (LATERAL LIMIT 1).

`billable_cents` = FN3a composition (billing: media+fee+adserving; delivery: exclude media where `client_pays_for_media`).

## Files (new only)

- `lib/finance/sections/investment/channelGroups.ts`
- `lib/finance/sections/investment/cutTypes.ts`
- `lib/finance/sections/investment/cutAggregate.ts` (fixture engine)
- `lib/finance/sections/investment/cutQuery.ts` (Drizzle SQL)
- `app/api/finance/sections/investment/cut/route.ts`
- `lib/finance/sections/investment/__tests__/cutAggregate.test.ts`
- `lib/finance/sections/investment/__tests__/cutQuery.normalize.test.ts`
- `scripts/verify/finance-investment-cut-probe.ts` → `npm run probe:finance-investment-cut`

## SQL (billing · dimensions:[client] · FY2025)

See probe `_debugSql.cut` / `investmentCutSqlText`. Core shape:

```sql
SELECT
  COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS dim_client,
  COALESCE(SUM(CASE WHEN sm.component = 'media' THEN sm.amount_cents ELSE 0 END), 0) AS media_cents,
  COALESCE(SUM(CASE WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0) AS fee_cents,
  COALESCE(SUM(CASE WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0) AS adserving_cents,
  COALESCE(SUM(sm.amount_cents), 0) AS billable_cents
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = 'billing'   -- or 'delivery' (never both)
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= DATE '2025-07-01' AND sm.month < DATE '2026-07-01'
LEFT JOIN LATERAL (
  SELECT li.* FROM line_items li
  WHERE li.version_id = v.id
    AND (li.line_item_id = sm.line_item_id
      OR (POSITION('::' IN sm.line_item_id) > 0
          AND li.line_item_id = SPLIT_PART(sm.line_item_id, '::', 2)))
  LIMIT 1
) li ON TRUE
LEFT JOIN clients c ON c.id = m.client_id
-- + publishers LATERAL for billingAgency; delivery adds client_pays gate
WHERE m.published_version_id IS NOT NULL
GROUP BY dim_client
ORDER BY dim_client ASC NULLS LAST, billable_cents DESC NULLS LAST
LIMIT 5001;
```

Fee coverage SQL counts distinct `(version_id, line_item_id, month)` with media vs media∧fee under the same filters/basis.

## Test results

```
npx tsx --test (with server-only shim) investment cut suites
→ 12 pass / 0 fail
  - multi-dim grouping, filters, search, Unmatched bucket
  - basis isolation + client-pays delivery
  - truncated flag
  - fee coverage meta + caveat
  - recon: cut{dimensions:[client]} billable ≡ FN3a fixture totals
```

## Live reconciliation (FY2025, all clients)

| basis | cut billable_cents | FN3a summary cents | delta | publisherMatchedPct | feeCoveragePct | mediaLineMonths | feeLineMonths | rows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| billing | 858,482,942 | 858,482,942 (receivables) | **0** | 48.9% | **0.1%** | 1,686 | 2 | 32 |
| delivery | 856,986,895 | 856,986,895 (payables) | **0** | 48.4% | **0%** | 1,773 | 0 | 32 |

`npm run probe:finance-investment-cut -- --fy=2025` → **PASS**.

## FEE CAVEAT (FN0 6a / O4.5 / C-21) — do not paper over

Live fee line-month coverage is ~0% (2 of 1,686 billing media months have a fee component; 0 of 1,773 delivery). `fee_cents` and therefore the fee slice of `billable_cents` **understate** agency fee for legacy/ETL tips that persisted media-only `schedule_months`.

**What margin view needs:** do not treat `fee_cents` from this cut as complete. Join `mba_fee_snapshots` and/or recompute fee from stamped `feePct × media` per line-month; never invent fee as `billable − media`. Response `coverage.fee.caveat` always carries this when fee/billable measures are requested.

## Margin / UI follow-ons

- Investment UI should surface `coverage.fee` when fee/billable columns are shown.
- channelGroup table above needs product sign-off before treating labels as permanent.
