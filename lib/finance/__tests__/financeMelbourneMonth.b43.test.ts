/**
 * B43 (B34 Q3): switch `finance_melbourne_month`. On: the finance "now"
 * (current billing month, current FY, the default range end) is the
 * Melbourne month. Off: the host's month, exactly as before.
 *
 * Boundaries: 31 Oct 2026 13:00Z is 1 Nov 00:00 AEDT; 31 May 2026 14:00Z is
 * 1 Jun 00:00 AEST; 30 Jun 2026 14:00Z is 1 Jul 00:00 AEST (new FY);
 * 31 Dec 2026 13:00Z is 1 Jan 2027 00:00 AEDT. The size test sweeps every
 * hour of 2026 against the UTC month (what Vercel's host reads).
 *
 * Requires --experimental-test-module-mocks for the route wiring tests.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { australianFyStartYearForDate, currentFinanceFyStartYear, getCurrentBillingMonth } from "../months.js"
import { buildDefaultFinanceScope, clampToCurrentMonth } from "../sections/defaultScope.js"
import { parseScopeFromParams } from "../sections/scopeUrl.js"
import { normalizeSummaryQuery } from "../sections/summaryQuery.js"
import { normalizeCostsQuery } from "../sections/costsQuery.js"
import { normalizeClientPaysQuery } from "../sections/clientPaysQuery.js"
import { normalizeFixedCostMarginQuery } from "../sections/fixedCostMargin/query.js"
import { normalizeInvestmentCutRequest } from "../sections/investment/cutQuery.js"

// Run as Vercel's host does (UTC), so "on" and "off" differ at the boundaries whatever this machine's zone is.
process.env.TZ = "UTC"

const ON = { melbourne: true }

/** The pre-B43 implementation, verbatim: the host's local month. */
function hostMonth(today: Date): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
}
function utcMonth(d: Date): string {
  return d.toISOString().slice(0, 7)
}

test("getCurrentBillingMonth on: the Melbourne month at each boundary (AEDT, AEST, year end)", () => {
  const cases: Array<[string, string]> = [
    ["2026-10-31T12:59:59.999Z", "2026-10"],
    ["2026-10-31T13:00:00.000Z", "2026-11"],
    ["2026-05-31T13:59:59.999Z", "2026-05"],
    ["2026-05-31T14:00:00.000Z", "2026-06"],
    ["2026-12-31T12:59:59.999Z", "2026-12"],
    ["2026-12-31T13:00:00.000Z", "2027-01"],
    ["2026-11-16T00:00:00.000Z", "2026-11"],
  ]
  for (const [iso, want] of cases) assert.equal(getCurrentBillingMonth(new Date(iso), ON), want, iso)
})

test("getCurrentBillingMonth off: exactly the host month, as before, at every hour of 2026 and with no options", () => {
  const start = Date.UTC(2026, 0, 1)
  for (let h = 0; h < 365 * 24; h += 1) {
    const d = new Date(start + h * 3_600_000)
    assert.equal(getCurrentBillingMonth(d), hostMonth(d))
    assert.equal(getCurrentBillingMonth(d, {}), hostMonth(d))
    assert.equal(getCurrentBillingMonth(d, { melbourne: false }), hostMonth(d))
    assert.equal(currentFinanceFyStartYear(d), australianFyStartYearForDate(d))
  }
})

test("off on a UTC host (Vercel): the month before for the first hours of the 1st, as before; on: the Melbourne month", () => {
  const saved = process.env.TZ
  process.env.TZ = "UTC"
  try {
    const now = new Date("2026-10-31T14:00:00Z") // 1 Nov 01:00 AEDT
    assert.equal(getCurrentBillingMonth(now), "2026-10")
    assert.equal(getCurrentBillingMonth(now, ON), "2026-11")
    const jul = new Date("2026-06-30T15:00:00Z") // 1 Jul 01:00 AEST
    assert.equal(currentFinanceFyStartYear(jul), 2025)
    assert.equal(currentFinanceFyStartYear(jul, ON), 2026)
    assert.deepEqual(normalizeSummaryQuery({ today: now }), { fy: 2026, from: "2026-07", to: "2026-10", clientIds: [] })
    assert.deepEqual(buildDefaultFinanceScope(now).monthRange, { from: "2026-07", to: "2026-10" })
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})

test("size: on and a UTC host differ only in the first 10 hours (AEST on the 1st) or 11 hours (AEDT on the 1st) of each Melbourne month", () => {
  const start = Date.UTC(2025, 11, 31, 12) // 31 Dec 2025 23:00 AEDT
  const diffHours = new Map<string, number>()
  for (let h = 0; h < 366 * 24; h += 1) {
    const d = new Date(start + h * 3_600_000)
    const mel = getCurrentBillingMonth(d, ON)
    if (mel !== utcMonth(d)) {
      diffHours.set(mel, (diffHours.get(mel) ?? 0) + 1)
      // Every differing hour is the Melbourne month running ahead of UTC, early on the 1st.
      assert.ok(mel > utcMonth(d), d.toISOString())
      const melDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", day: "2-digit" }).format(d)
      assert.equal(melDay, "01", d.toISOString())
    }
  }
  const want: Record<string, number> = {
    // Daylight saving ends 5 Apr and starts 4 Oct 2026, so 1 Apr is AEDT (11) and 1 Oct AEST (10).
    "2026-01": 11, "2026-02": 11, "2026-03": 11, "2026-04": 11, "2026-05": 10, "2026-06": 10,
    "2026-07": 10, "2026-08": 10, "2026-09": 10, "2026-10": 10, "2026-11": 11, "2026-12": 11,
  }
  for (const [month, hours] of Object.entries(want)) assert.equal(diffHours.get(month), hours, month)
})

test("currentFinanceFyStartYear on: 1 July starts the new FY at Melbourne midnight", () => {
  assert.equal(currentFinanceFyStartYear(new Date("2026-06-30T13:59:59.999Z"), ON), 2025)
  assert.equal(currentFinanceFyStartYear(new Date("2026-06-30T14:00:00.000Z"), ON), 2026)
  assert.equal(currentFinanceFyStartYear(new Date("2026-11-16T00:00:00Z"), ON), 2026)
  assert.equal(currentFinanceFyStartYear(new Date("2027-01-10T00:00:00Z"), ON), 2026)
})

test("default ranges on: the summary, costs, client pays, fixed cost and investment cut end on the Melbourne month", () => {
  const now = new Date("2026-10-31T14:00:00Z") // 1 Nov 01:00 AEDT, 31 Oct UTC
  const want = { fy: 2026, from: "2026-07", to: "2026-11" }
  const pick = (q: { fy: number; from: string; to: string }) => ({ fy: q.fy, from: q.from, to: q.to })
  assert.deepEqual(pick(normalizeSummaryQuery({ today: now, melbourneMonth: true })), want)
  assert.deepEqual(pick(normalizeCostsQuery({ today: now, melbourneMonth: true })), want)
  assert.deepEqual(pick(normalizeClientPaysQuery({ today: now, melbourneMonth: true })), want)
  assert.deepEqual(pick(normalizeFixedCostMarginQuery({ today: now, melbourneMonth: true })), want)
  const cut = normalizeInvestmentCutRequest({ fy: undefined as unknown as number, basis: "billing", dimensions: [], measures: [] }, now, ON)
  assert.ok(!("error" in cut))
  assert.deepEqual(pick(cut as { fy: number; from: string; to: string }), want)
  // A range sent by the page is the page's, on or off.
  assert.deepEqual(pick(normalizeSummaryQuery({ today: now, melbourneMonth: true, from: "2026-08", to: "2026-09" })), {
    fy: 2026,
    from: "2026-08",
    to: "2026-09",
  })
})

test("default ranges off: as before (the host month), and the switch adds nothing to the query", () => {
  const now = new Date("2026-10-31T14:00:00Z")
  const host = hostMonth(now)
  const fy = australianFyStartYearForDate(now)
  const q = normalizeSummaryQuery({ today: now })
  assert.deepEqual(q, { fy, from: `${fy}-07`, to: host, clientIds: [] })
  assert.deepEqual(normalizeSummaryQuery({ today: now, melbourneMonth: false }), q)
  assert.deepEqual(normalizeCostsQuery({ today: now }), { ...q, channels: [], publishers: [] })
  const cut = normalizeInvestmentCutRequest({ fy: undefined as unknown as number, basis: "billing", dimensions: [], measures: [] }, now)
  assert.ok(!("error" in cut))
  assert.equal((cut as { to: string }).to, host)
})

test("1 July on: the default range is the new FY's first month; off follows the host", () => {
  const now = new Date("2026-06-30T15:00:00Z") // 1 Jul 01:00 AEST
  const on = normalizeSummaryQuery({ today: now, melbourneMonth: true })
  assert.deepEqual([on.fy, on.from, on.to], [2026, "2026-07", "2026-07"])
  const off = normalizeSummaryQuery({ today: now })
  const fy = australianFyStartYearForDate(now)
  assert.deepEqual([off.fy, off.to], [fy, fy === 2026 ? "2026-07" : "2026-06"])
})

test("the hub scope bar defaults: buildDefaultFinanceScope, clampToCurrentMonth and parseScopeFromParams take the switch", () => {
  const now = new Date("2026-10-31T13:30:00Z") // 1 Nov 00:30 AEDT
  assert.deepEqual(buildDefaultFinanceScope(now, ON).monthRange, { from: "2026-07", to: "2026-11" })
  assert.equal(buildDefaultFinanceScope(now, ON).fy, 2026)
  assert.deepEqual(clampToCurrentMonth(2026, { from: "2026-07", to: "2027-06" }, now, ON), { from: "2026-07", to: "2026-11" })
  assert.deepEqual(parseScopeFromParams(new URLSearchParams(), now, ON).monthRange, { from: "2026-07", to: "2026-11" })
  // Off: as before.
  const fy = australianFyStartYearForDate(now)
  assert.deepEqual(buildDefaultFinanceScope(now).monthRange, { from: `${fy}-07`, to: hostMonth(now) })
  assert.deepEqual(parseScopeFromParams(new URLSearchParams(), now).monthRange, buildDefaultFinanceScope(now).monthRange)
})

// ---------------------------------------------------------------------------
// Route wiring: each route reads the switch and passes it on.
// ---------------------------------------------------------------------------

const seen: Array<{ fn: string; args: unknown[] }> = []
const record = (fn: string, value: unknown) => (...args: unknown[]) => {
  seen.push({ fn, args })
  return value
}

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", { namedExports: { requireFinanceAdmin: async () => ({ user: { email: "a@x.au" } }) } })
  const q = { fy: 2026, from: "2026-07", to: "2026-11", clientIds: [] }
  await mock.module!("@/lib/finance/sections/summaryQuery", {
    namedExports: { normalizeSummaryQuery: record("normalizeSummaryQuery", q), fetchFinanceSectionsSummary: record("fetchFinanceSectionsSummary", Promise.resolve({})) },
  })
  await mock.module!("@/lib/finance/sections/costsQuery", {
    namedExports: { normalizeCostsQuery: record("normalizeCostsQuery", q), fetchFinanceCostsSummary: record("fetchFinanceCostsSummary", Promise.resolve({})) },
  })
  await mock.module!("@/lib/finance/sections/clientPaysQuery", {
    namedExports: { normalizeClientPaysQuery: record("normalizeClientPaysQuery", q), fetchFinanceClientPays: record("fetchFinanceClientPays", Promise.resolve({})) },
  })
  await mock.module!("@/lib/finance/sections/fixedCostMargin/query", {
    namedExports: { normalizeFixedCostMarginQuery: record("normalizeFixedCostMarginQuery", q), fetchFinanceFixedCostMargin: record("fetchFinanceFixedCostMargin", Promise.resolve({})) },
  })
  await mock.module!("@/lib/finance/sections/investment/cutQuery", {
    namedExports: { normalizeInvestmentCutRequest: record("normalizeInvestmentCutRequest", q), fetchInvestmentCut: record("fetchInvestmentCut", Promise.resolve({})) },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

test("routes: the summary, costs, client pays, fixed cost margin and investment cut pass the switch on", { skip: mockModuleSkip() }, async () => {
  const { NextRequest } = await import("next/server")
  const summary = await import("../../../app/api/finance/sections/summary/route.js")
  const costs = await import("../../../app/api/finance/sections/costs/summary/route.js")
  const pays = await import("../../../app/api/finance/sections/costs/client-pays/route.js")
  const fixed = await import("../../../app/api/finance/sections/costs/fixed-cost-margin/route.js")
  const cut = await import("../../../app/api/finance/sections/investment/cut/route.js")
  const get = (path: string) => new NextRequest(`http://l${path}`)
  const post = () =>
    new NextRequest("http://l/api/finance/sections/investment/cut", {
      method: "POST",
      body: JSON.stringify({ fy: 2026, basis: "billing", dimensions: [], measures: [] }),
    })
  for (const on of [false, true]) {
    setFeatureRowReaderForTests(async () => new Map([["finance_melbourne_month", row("finance_melbourne_month", on)]]))
    seen.length = 0
    try {
      for (const res of [
        await summary.GET(get("/api/finance/sections/summary")),
        await costs.GET(get("/api/finance/sections/costs/summary")),
        await pays.GET(get("/api/finance/sections/costs/client-pays")),
        await fixed.GET(get("/api/finance/sections/costs/fixed-cost-margin")),
        await cut.POST(post()),
      ]) {
        assert.equal(res.status, 200)
      }
    } finally {
      setFeatureRowReaderForTests(null)
    }
    const arg = (fn: string, i: number) => seen.find((s) => s.fn === fn)!.args[i] as Record<string, unknown>
    assert.equal(arg("normalizeSummaryQuery", 0).melbourneMonth, on)
    assert.equal(arg("fetchFinanceSectionsSummary", 1).melbourneMonth, on, "the current-month billing tile")
    assert.equal(arg("normalizeCostsQuery", 0).melbourneMonth, on)
    assert.equal(arg("fetchFinanceCostsSummary", 1).melbourneMonth, on)
    assert.equal(arg("normalizeClientPaysQuery", 0).melbourneMonth, on)
    assert.equal(arg("fetchFinanceClientPays", 1).melbourneMonth, on)
    assert.equal(arg("normalizeFixedCostMarginQuery", 0).melbourneMonth, on)
    assert.deepEqual(arg("normalizeInvestmentCutRequest", 2), { melbourne: on })
  }
})
