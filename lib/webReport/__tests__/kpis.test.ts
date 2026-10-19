import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { PACING_STATUS_THRESHOLDS } from "@/lib/pacing/status"
import { computeKpiActuals } from "@/lib/webReport/kpis/actuals"
import {
  KPI_STATUS_THRESHOLDS,
  kpiProgress,
  kpiStatus,
  monthsInWindow,
  proratedTarget,
} from "@/lib/webReport/kpis/progress"
import { validateKpiInput, validateTargets, type WebKpi } from "@/lib/webReport/kpis/types"

function kpi(overrides: Partial<WebKpi> = {}): WebKpi {
  return {
    id: "k1",
    clientId: 7,
    label: "Distributor clicks",
    source: "ga4_event",
    eventNames: ["where_to_buy_click", "Skin_distributor_clicks"],
    metric: null,
    active: true,
    sortOrder: 0,
    targets: [],
    ...overrides,
  }
}

const SPAN = { from: "2026-09-16", to: "2026-10-15" }

describe("web KPI pro-rating", () => {
  it("splits a window across two months by days in each month", () => {
    assert.deepEqual(monthsInWindow(SPAN), [
      { month: "2026-09-01", days: 15, daysInMonth: 30 },
      { month: "2026-10-01", days: 15, daysInMonth: 31 },
    ])
    const target = proratedTarget(
      [
        { month: "2026-09-01", target: 300 },
        { month: "2026-10-01", target: 310 },
      ],
      SPAN,
    )
    assert.equal(target, 300)
  })

  it("skips a month with no target and lists it", () => {
    const progress = kpiProgress(
      { targets: [{ month: "2026-09-01", target: 300 }] },
      {
        total: 400,
        months: [
          { month: "2026-09-01", actual: 150 },
          { month: "2026-10-01", actual: 250 },
        ],
      },
      SPAN,
      "2026-10-31",
    )
    assert.equal(progress.target, 150)
    assert.equal(progress.targetToDate, 150)
    assert.equal(progress.actualToDate, 150)
    assert.equal(progress.pace, 1)
    assert.equal(progress.status, "on-track")
    assert.deepEqual(progress.monthsWithoutTarget, ["2026-10-01"])
  })

  it("has no target and no-data status when no month has a target", () => {
    const progress = kpiProgress({ targets: [] }, { total: 10, months: [] }, SPAN, "2026-10-31")
    assert.equal(progress.target, null)
    assert.equal(progress.pace, null)
    assert.equal(progress.status, "no-data")
  })

  it("paces against the target to date, not the whole window", () => {
    const progress = kpiProgress(
      { targets: [{ month: "2026-09-01", target: 300 }] },
      { total: 100, months: [{ month: "2026-09-01", actual: 100 }] },
      { from: "2026-09-01", to: "2026-09-30" },
      "2026-09-10",
    )
    assert.equal(progress.target, 300)
    assert.equal(progress.targetToDate, 100)
    assert.equal(progress.status, "on-track")
  })

  it("is no-data before the window starts", () => {
    const progress = kpiProgress(
      { targets: [{ month: "2026-09-01", target: 300 }] },
      { total: 0, months: [{ month: "2026-09-01", actual: 0 }] },
      { from: "2026-09-01", to: "2026-09-30" },
      "2026-08-31",
    )
    assert.equal(progress.targetToDate, null)
    assert.equal(progress.status, "no-data")
  })
})

describe("web KPI status", () => {
  it("uses campaign pacing's cut-offs", () => {
    assert.equal(KPI_STATUS_THRESHOLDS.behindBelowPct, PACING_STATUS_THRESHOLDS.behindBelowPct)
    assert.equal(KPI_STATUS_THRESHOLDS.aheadAbovePct, PACING_STATUS_THRESHOLDS.aheadAbovePct)
    for (const pct of [0, 50, 89.99, 90, 95, 100, 105, 110, 110.01, 114.9, 115, 200]) {
      assert.equal(kpiStatus(pct / 100), deliveryStatusFromPct(pct), `${pct}%`)
    }
    assert.equal(kpiStatus(0.8999), "behind")
    assert.equal(kpiStatus(0.9), "on-track")
    assert.equal(kpiStatus(1.05), "on-track")
    assert.equal(kpiStatus(1.1), "on-track")
    assert.equal(kpiStatus(1.1001), "ahead")
    assert.equal(kpiStatus(1.5), "ahead")
    assert.equal(kpiStatus(null), "no-data")
  })
})

describe("web KPI actuals", () => {
  const window = { from: "2026-09-29", to: "2026-10-02" }

  it("sums every listed event name, by month", () => {
    const [actual] = computeKpiActuals({
      kpis: [kpi()],
      window,
      events: [
        { date: "2026-09-29", eventName: "where_to_buy_click", count: 3 },
        { date: "2026-09-30", eventName: "Skin_distributor_clicks", count: 4 },
        { date: "2026-10-01", eventName: "where_to_buy_click", count: 5 },
        { date: "2026-10-01", eventName: "distributor_tracking", count: 100 },
        { date: "2026-10-03", eventName: "where_to_buy_click", count: 50 },
      ],
      metrics: [],
      ga4Readable: true,
      gscReadable: true,
    })
    assert.equal(actual.total, 12)
    assert.deepEqual(actual.months, [
      { month: "2026-09-01", actual: 7 },
      { month: "2026-10-01", actual: 5 },
    ])
  })

  it("leaves out inactive KPIs and reads metrics by name", () => {
    const actuals = computeKpiActuals({
      kpis: [
        kpi({ id: "off", active: false }),
        kpi({ id: "clicks", source: "gsc_metric", eventNames: null, metric: "clicks" }),
      ],
      window,
      events: [{ date: "2026-09-29", eventName: "where_to_buy_click", count: 3 }],
      metrics: [
        { date: "2026-09-30", metric: "clicks", value: 20 },
        { date: "2026-09-30", metric: "impressions", value: 900 },
      ],
      ga4Readable: true,
      gscReadable: true,
    })
    assert.deepEqual(actuals.map((item) => item.kpiId), ["clicks"])
    assert.equal(actuals[0].total, 20)
  })

  it("has a null total when the source cannot be read", () => {
    const [actual] = computeKpiActuals({
      kpis: [kpi()],
      window,
      events: [],
      metrics: [],
      ga4Readable: false,
      gscReadable: true,
    })
    assert.equal(actual.total, null)
  })
})

describe("web KPI input", () => {
  it("needs an event name for ga4_event and a matching metric otherwise", () => {
    assert.throws(() => validateKpiInput({ clientId: 7, label: "x", source: "ga4_event", eventNames: [" "] }))
    assert.throws(() => validateKpiInput({ clientId: 7, label: "x", source: "ga4_metric", metric: "clicks" }))
    const clean = validateKpiInput({ clientId: 7, label: " Clicks ", source: "gsc_metric", metric: "clicks", eventNames: ["a"] })
    assert.deepEqual(clean, { id: undefined, clientId: 7, label: "Clicks", source: "gsc_metric", eventNames: null, metric: "clicks", sortOrder: 0 })
  })

  it("needs the first of the month and a non-negative target", () => {
    assert.throws(() => validateTargets([{ month: "2026-09-02", target: 1 }]))
    assert.throws(() => validateTargets([{ month: "2026-09-01", target: -1 }]))
    assert.doesNotThrow(() => validateTargets([{ month: "2026-09-01", target: 0 }]))
  })
})
