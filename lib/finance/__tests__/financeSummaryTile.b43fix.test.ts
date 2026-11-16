/**
 * B43fix (review R2): the Finance summary's current-month billing tile reads
 * the month `finance_melbourne_month` names. The fetch runs against a stub
 * executor that answers the tile's one-month query with a figure per month,
 * so the test sees which month window the tile asked for.
 *
 * 31 Oct 2026 13:30Z is 1 Nov 00:30 AEDT. On a UTC host (Vercel) the switch
 * off reads October (as before B43); on reads November.
 *
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

process.env.TZ = "UTC"

const skip = mockModuleSkip()
const dialect = new PgDialect()

/** The cents the stub answers for a one-month window starting in month `m` (1 to 12). */
const centsFor = (m: number) => 100 * m

/** [start, endExclusive] when the query's date parameters are exactly one month apart. */
function oneMonthWindow(params: unknown[]): number | null {
  const dates = params.filter((p): p is string => typeof p === "string" && /^\d{4}-\d{2}-01$/.test(p))
  for (let i = 0; i + 1 < dates.length; i++) {
    const [y1, m1] = dates[i]!.split("-").map(Number)
    const [y2, m2] = dates[i + 1]!.split("-").map(Number)
    if (y2! * 12 + m2! === y1! * 12 + m1! + 1) return m1!
  }
  return null
}

const stub = {
  execute: async (query: SQL) => {
    const { sql: text, params } = dialect.sqlToQuery(query)
    if (/sm\.basis = 'billing'/.test(text) && /AS cents/.test(text)) {
      const month = oneMonthWindow(params)
      if (month != null) return [{ cents: String(centsFor(month)) }]
    }
    return [{ cents: "0", count: "0" }]
  },
}

if (supportsMockModule()) {
  await mock.module!("@/db", { namedExports: { getDb: () => stub, db: stub } })
}

const QUERY = { fy: 2026, from: "2026-07", to: "2026-09", clientIds: [] as number[] }
const NOW = new Date("2026-10-31T13:30:00Z") // 1 Nov 00:30 AEDT

test("the tile: switch off reads the host month (October on a UTC host); on reads the Melbourne month (November)", { skip }, async () => {
  const { fetchFinanceSectionsSummary } = await import("../sections/summaryQuery.js")
  const off = await fetchFinanceSectionsSummary(QUERY, { now: NOW })
  assert.equal(Number(off.currentMonthBilling.cents), centsFor(10))
  assert.match(off.currentMonthBilling.scope, /^2026-10 /)
  const offExplicit = await fetchFinanceSectionsSummary(QUERY, { now: NOW, melbourneMonth: false })
  assert.equal(Number(offExplicit.currentMonthBilling.cents), centsFor(10))
  const on = await fetchFinanceSectionsSummary(QUERY, { now: NOW, melbourneMonth: true })
  assert.equal(Number(on.currentMonthBilling.cents), centsFor(11))
  assert.match(on.currentMonthBilling.scope, /^2026-11 /)
})

test("the tile: away from a month boundary on and off agree", { skip }, async () => {
  const { fetchFinanceSectionsSummary } = await import("../sections/summaryQuery.js")
  const mid = new Date("2026-11-16T03:00:00Z")
  const off = await fetchFinanceSectionsSummary(QUERY, { now: mid })
  const on = await fetchFinanceSectionsSummary(QUERY, { now: mid, melbourneMonth: true })
  assert.equal(Number(off.currentMonthBilling.cents), centsFor(11))
  assert.equal(Number(on.currentMonthBilling.cents), centsFor(11))
})
