import assert from "node:assert/strict"
import test from "node:test"

import {
  FINANCE_FORECAST_LINE_KEYS,
  type FinanceForecastDataset,
} from "../../../../types/financeForecast.js"
import {
  aggregateBilledActualsToClientMonth,
  billingMonthToForecastMonthKey,
  bookedMonthlyFromDataset,
  buildTargetVsActualVariance,
  measureDelta,
  ragForTargetVsActual,
  rollTargetsToClientMonth,
} from "../targetVsActual.js"

test("billingMonthToForecastMonthKey maps calendar months", () => {
  assert.equal(billingMonthToForecastMonthKey("2025-07"), "july")
  assert.equal(billingMonthToForecastMonthKey("2026-01"), "january")
  assert.equal(billingMonthToForecastMonthKey("bad"), null)
})

test("measureDelta guards divide-by-zero via financeForecastVariancePercentChange", () => {
  assert.equal(measureDelta(0, 100).delta_pct, null)
  assert.equal(measureDelta(100, 110).delta_pct, 10)
  assert.equal(measureDelta(100, 90).delta, -10)
})

test("ragForTargetVsActual classifies shortfall bands", () => {
  assert.equal(ragForTargetVsActual(100, 110), "ahead")
  assert.equal(ragForTargetVsActual(100, 100), "on_track")
  assert.equal(ragForTargetVsActual(100, 96), "on_track")
  assert.equal(ragForTargetVsActual(100, 90), "behind")
  assert.equal(ragForTargetVsActual(100, 80), "critical")
  assert.equal(ragForTargetVsActual(0, 0), "on_track")
})

test("rollTargetsToClientMonth sums across line keys", () => {
  const rolled = rollTargetsToClientMonth([
    { client_id: "1", client_name: "Acme", month_key: "july", amount: 10 },
    { client_id: "1", client_name: "Acme", month_key: "july", amount: 5 },
    { client_id: "1", month_key: "august", amount: 3 },
  ])
  const july = rolled.find((r) => r.month_key === "july")
  assert.equal(july?.amount, 15)
})

test("aggregateBilledActualsToClientMonth uses billed_amount only when billed", () => {
  const fy = new Set(["2025-07", "2025-08"])
  const rows = aggregateBilledActualsToClientMonth(
    [
      {
        clients_id: 9,
        client_name: "Acme",
        billing_month: "2025-07",
        billed: true,
        billed_amount: 100,
      },
      {
        clients_id: 9,
        client_name: "Acme",
        billing_month: "2025-07",
        billed: true,
        billed_amount: 40,
      },
      {
        clients_id: 9,
        client_name: "Acme",
        billing_month: "2025-07",
        billed: false,
        billed_amount: 999,
      },
      {
        clients_id: 9,
        client_name: "Acme",
        billing_month: "2024-07",
        billed: true,
        billed_amount: 50,
      },
    ],
    fy
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.amount, 140)
  assert.equal(rows[0]!.month_key, "july")
})

test("buildTargetVsActualVariance reconciles FY totals and includes booked ref", () => {
  const report = buildTargetVsActualVariance({
    financial_year_start_year: 2025,
    targets: [
      { client_id: "1", client_name: "Acme", month_key: "july", amount: 100 },
      { client_id: "1", client_name: "Acme", month_key: "august", amount: 50 },
    ],
    actuals: [
      { client_id: "1", client_name: "Acme", month_key: "july", amount: 80 },
      { client_id: "1", client_name: "Acme", month_key: "august", amount: 50 },
    ],
    booked: [{ client_id: "1", client_name: "Acme", month_key: "july", amount: 90 }],
  })

  assert.equal(report.clients.length, 1)
  assert.equal(report.clients[0]!.fy.target, 150)
  assert.equal(report.clients[0]!.fy.actual, 130)
  assert.equal(report.clients[0]!.fy.delta, -20)
  assert.equal(report.clients[0]!.fy.booked, 90)
  assert.equal(report.totals.target, 150)
  assert.equal(report.totals.actual, 130)
  assert.equal(report.actual_grain, "client_month")
  assert.equal(report.phase, 1)
})

test("bookedMonthlyFromDataset prefers total_revenue line", () => {
  const dataset: FinanceForecastDataset = {
    meta: { financial_year_start_year: 2025, scenario: "confirmed" },
    client_blocks: [
      {
        client_id: "1",
        client_name: "Acme",
        groups: [
          {
            group_key: "revenue_client_publisher_fees_commission",
            lines: [
              {
                client_id: "1",
                client_name: "Acme",
                media_plan_version_id: null,
                version_number: null,
                scenario: "confirmed",
                group_key: "revenue_client_publisher_fees_commission",
                line_key: FINANCE_FORECAST_LINE_KEYS.retainer,
                monthly: {
                  july: 10,
                  august: 0,
                  september: 0,
                  october: 0,
                  november: 0,
                  december: 0,
                  january: 0,
                  february: 0,
                  march: 0,
                  april: 0,
                  may: 0,
                  june: 0,
                },
                fy_total: 10,
                source: { kind: "test" },
              },
              {
                client_id: "1",
                client_name: "Acme",
                media_plan_version_id: null,
                version_number: null,
                scenario: "confirmed",
                group_key: "revenue_client_publisher_fees_commission",
                line_key: FINANCE_FORECAST_LINE_KEYS.totalRevenue,
                monthly: {
                  july: 42,
                  august: 0,
                  september: 0,
                  october: 0,
                  november: 0,
                  december: 0,
                  january: 0,
                  february: 0,
                  march: 0,
                  april: 0,
                  may: 0,
                  june: 0,
                },
                fy_total: 42,
                source: { kind: "test" },
              },
            ],
          },
        ],
      },
    ],
  }
  const booked = bookedMonthlyFromDataset(dataset)
  assert.equal(booked.find((r) => r.month_key === "july")?.amount, 42)
})
