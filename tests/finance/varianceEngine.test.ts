import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyFinanceForecastVariance,
  compareFinanceForecastSnapshots,
  financeForecastVariancePercentChange,
} from "../../lib/finance/forecast/snapshot/varianceEngine.js"
import { indexSnapshotLinesByComparisonKey } from "../../lib/finance/forecast/snapshot/compareSnapshotLines.js"
import { FINANCE_FORECAST_FISCAL_MONTH_ORDER } from "../../lib/types/financeForecast.js"
import {
  FINANCE_FORECAST_GROUP_KEYS,
  FINANCE_FORECAST_LINE_KEYS,
} from "../../lib/types/financeForecast.js"
import type { FinanceForecastSnapshotLineRecord } from "../../lib/types/financeForecastSnapshot.js"

function line(p: Partial<FinanceForecastSnapshotLineRecord> & Pick<FinanceForecastSnapshotLineRecord, "amount">): FinanceForecastSnapshotLineRecord {
  return {
    id: p.id ?? "ln-1",
    snapshot_id: p.snapshot_id ?? "snap-a",
    client_id: p.client_id ?? "c1",
    client_name: p.client_name ?? "Client",
    campaign_id: p.campaign_id ?? null,
    mba_number: p.mba_number ?? "MBA-1",
    media_plan_version_id: p.media_plan_version_id ?? "v1",
    version_number: p.version_number != null ? p.version_number : 1,
    group_key: p.group_key ?? FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
    line_key: p.line_key ?? FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher,
    month_key: p.month_key ?? "july",
    amount: p.amount,
    fy_total: p.fy_total ?? p.amount,
    source_hash: p.source_hash ?? null,
    source_debug_json: p.source_debug_json ?? null,
  }
}

test("classifyFinanceForecastVariance covers new, removed, increased, decreased, unchanged", () => {
  assert.equal(classifyFinanceForecastVariance(null, 100, 0), "new")
  assert.equal(classifyFinanceForecastVariance(100, null, 0), "removed")
  assert.equal(classifyFinanceForecastVariance(10, 50, 0), "increased")
  assert.equal(classifyFinanceForecastVariance(80, 20, 0), "decreased")
  assert.equal(classifyFinanceForecastVariance(40, 40, 0), "unchanged")
})

test("classifyFinanceForecastVariance respects epsilon", () => {
  assert.equal(classifyFinanceForecastVariance(10, 10.0004, 0.001), "unchanged")
  assert.equal(classifyFinanceForecastVariance(null, 0.0001, 0.001), "unchanged")
})

test("financeForecastVariancePercentChange is null when baseline is zero or sides missing", () => {
  assert.equal(financeForecastVariancePercentChange(null, 10), null)
  assert.equal(financeForecastVariancePercentChange(10, null), null)
  assert.equal(financeForecastVariancePercentChange(0, 100), null)
  assert.equal(financeForecastVariancePercentChange(200, 250), 25)
})

test("compareFinanceForecastSnapshots: variance by month line and fy total", () => {
  const older = [
    line({
      id: "a1",
      snapshot_id: "old",
      amount: 100,
      month_key: "july",
      media_plan_version_id: "v1",
    }),
  ]
  const newer = [
    line({
      id: "b1",
      snapshot_id: "new",
      amount: 160,
      month_key: "july",
      media_plan_version_id: "v1",
    }),
    line({
      id: "b2",
      snapshot_id: "new",
      amount: 40,
      month_key: "august",
      media_plan_version_id: "v1",
    }),
  ]
  const report = compareFinanceForecastSnapshots(
    { snapshot_id: "old", lines: older },
    { snapshot_id: "new", lines: newer },
    { include_unchanged: false }
  )
  const july = report.by_month_line.find((r) => r.month_key === "july")
  assert.ok(july)
  assert.equal(july?.change_type, "increased")
  assert.equal(july?.absolute_change, 60)
  assert.equal(report.fy_total.old_amount, 100)
  assert.equal(report.fy_total.new_amount, 200)
  assert.equal(report.fy_total.absolute_change, 100)
})

test("compareFinanceForecastSnapshots: aggregates by fy line across months", () => {
  const older = [
    line({ id: "1", amount: 50, month_key: "july" }),
    line({ id: "2", amount: 25, month_key: "august" }),
  ]
  const newer = [
    line({ id: "3", amount: 50, month_key: "july" }),
    line({ id: "4", amount: 50, month_key: "august" }),
  ]
  const report = compareFinanceForecastSnapshots(
    { snapshot_id: "a", lines: older },
    { snapshot_id: "b", lines: newer },
    { include_unchanged: false }
  )
  const agg = report.by_fy_line.find(
    (r) =>
      r.client_id === "c1" &&
      r.line_key === FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher
  )
  assert.ok(agg)
  assert.equal(agg?.old_amount, 75)
  assert.equal(agg?.new_amount, 100)
})

test("by_month follows July → June order even when other months have larger deltas", () => {
  const older = [
    line({ id: "o1", amount: 1, month_key: "june" }),
    line({ id: "o2", amount: 1, month_key: "july" }),
  ]
  const newer = [
    line({ id: "n1", amount: 10, month_key: "june" }),
    line({ id: "n2", amount: 5, month_key: "july" }),
  ]
  const report = compareFinanceForecastSnapshots(
    { snapshot_id: "a", lines: older },
    { snapshot_id: "b", lines: newer },
    { include_unchanged: false }
  )
  const keys = report.by_month.map((r) => r.month_key)
  const expected = FINANCE_FORECAST_FISCAL_MONTH_ORDER.filter((k) => k === "july" || k === "june")
  assert.deepEqual(keys, expected)
})

test("duplicate comparison keys: last line wins in snapshot index (stable for single-writer snapshots)", () => {
  const dup = [
    line({ id: "x1", amount: 10, snapshot_id: "s" }),
    line({ id: "x2", amount: 99, snapshot_id: "s" }),
  ]
  const m = indexSnapshotLinesByComparisonKey(dup)
  assert.equal(m.size, 1)
  assert.equal(m.values().next().value?.amount, 99)
})

test("client rollup sums all lines; tolerates differing names on same client_id", () => {
  const older = [
    line({ id: "1", amount: 30, client_name: "Client A" }),
  ]
  const newer = [
    line({ id: "2", amount: 10, client_name: "Client A (display)" }),
    line({
      id: "3",
      amount: 21,
      client_id: "c1",
      client_name: "Client A (display)",
      line_key: FINANCE_FORECAST_LINE_KEYS.commission,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    }),
  ]
  const report = compareFinanceForecastSnapshots(
    { snapshot_id: "a", lines: older },
    { snapshot_id: "b", lines: newer },
    { include_unchanged: false }
  )
  const c = report.by_client.find((r) => r.client_id === "c1")
  assert.ok(c)
  assert.equal(c?.old_amount, 30)
  assert.equal(c?.new_amount, 31)
  assert.equal(c?.change_type, "increased")
})
