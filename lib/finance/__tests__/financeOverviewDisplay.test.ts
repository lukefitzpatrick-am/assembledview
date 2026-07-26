import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatCurrentMonthKpiLabel,
  monthRangeCoversFyToDate,
  resolveNetAccrualKpiState,
  resolveOverviewSpendChartMode,
  resolveScheduleFytdKpiState,
} from "@/lib/finance/financeOverviewDisplay"

describe("formatCurrentMonthKpiLabel", () => {
  it("formats YYYY-MM as Mon YYYY", () => {
    assert.equal(formatCurrentMonthKpiLabel("2026-07"), "Jul 2026")
    assert.equal(formatCurrentMonthKpiLabel("2025-01"), "Jan 2025")
  })
})

describe("monthRangeCoversFyToDate", () => {
  it("returns true when hub range includes every FY-to-date month", () => {
    assert.equal(
      monthRangeCoversFyToDate(
        { from: "2025-07", to: "2026-06" },
        ["2025-07", "2025-08", "2025-09"]
      ),
      true
    )
  })

  it("returns false when hub range is a single current month", () => {
    assert.equal(
      monthRangeCoversFyToDate({ from: "2026-07", to: "2026-07" }, [
        "2025-07",
        "2025-08",
        "2026-07",
      ]),
      false
    )
  })

  it("returns true when there are no FY months to cover", () => {
    assert.equal(monthRangeCoversFyToDate({ from: "2026-07", to: "2026-07" }, []), true)
  })
})

describe("resolveScheduleFytdKpiState", () => {
  it("is loading while the schedule feed is in flight", () => {
    assert.equal(resolveScheduleFytdKpiState({ loading: true, error: null }), "loading")
  })

  it("is error when the schedule feed failed", () => {
    assert.equal(resolveScheduleFytdKpiState({ loading: false, error: "boom" }), "error")
  })

  it("is ready when loaded without error", () => {
    assert.equal(resolveScheduleFytdKpiState({ loading: false, error: null }), "ready")
  })
})

describe("resolveNetAccrualKpiState", () => {
  it("defers when hub range does not cover FY-to-date", () => {
    assert.equal(
      resolveNetAccrualKpiState({
        storeLoading: false,
        rangeCoversFyToDate: false,
      }),
      "deferred"
    )
  })

  it("loads when range covers FY but store is still fetching", () => {
    assert.equal(
      resolveNetAccrualKpiState({
        storeLoading: true,
        rangeCoversFyToDate: true,
      }),
      "loading"
    )
  })

  it("is ready when range covers FY and store is idle", () => {
    assert.equal(
      resolveNetAccrualKpiState({
        storeLoading: false,
        rangeCoversFyToDate: true,
      }),
      "ready"
    )
  })
})

describe("resolveOverviewSpendChartMode", () => {
  it("prefers treemap when the dashboard feed has slices", () => {
    assert.equal(
      resolveOverviewSpendChartMode({
        chartsLoading: false,
        storeLoading: false,
        treemapHasData: true,
        fyBillingBarHasData: true,
        rangeCoversFyToDate: true,
      }),
      "treemap"
    )
  })

  it("falls back to FY client-billing bar when treemap feed is empty", () => {
    assert.equal(
      resolveOverviewSpendChartMode({
        chartsLoading: false,
        storeLoading: false,
        treemapHasData: false,
        fyBillingBarHasData: true,
        rangeCoversFyToDate: true,
      }),
      "fallback-bar"
    )
  })

  it("defers when treemap is empty and FY store range is not ready", () => {
    assert.equal(
      resolveOverviewSpendChartMode({
        chartsLoading: false,
        storeLoading: false,
        treemapHasData: false,
        fyBillingBarHasData: false,
        rangeCoversFyToDate: false,
      }),
      "deferred"
    )
  })

  it("loads while store fetches after range already covers FY", () => {
    assert.equal(
      resolveOverviewSpendChartMode({
        chartsLoading: false,
        storeLoading: true,
        treemapHasData: false,
        fyBillingBarHasData: false,
        rangeCoversFyToDate: true,
      }),
      "loading"
    )
  })

  it("is empty only when both treemap and FY billing bar are empty", () => {
    assert.equal(
      resolveOverviewSpendChartMode({
        chartsLoading: false,
        storeLoading: false,
        treemapHasData: false,
        fyBillingBarHasData: false,
        rangeCoversFyToDate: true,
      }),
      "empty"
    )
  })

  it("is loading while charts are in flight", () => {
    assert.equal(
      resolveOverviewSpendChartMode({
        chartsLoading: true,
        storeLoading: false,
        treemapHasData: false,
        fyBillingBarHasData: false,
        rangeCoversFyToDate: false,
      }),
      "loading"
    )
  })
})
