/**
 * RELFIX1 (B49 R1, S9): the four "this month" sites read the Melbourne month
 * of now, never the UTC or host month. Each runs with the process clock
 * mocked at instants where the two months differ:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT (UTC month November);
 *   - 30 Jun 2026 14:30Z, 1 Jul 00:30 AEST (UTC month June).
 * The file runs in UTC, the Vercel zone, so a host-month revert fails here
 * on a Sydney host too (R5).
 */
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", month: "2026-12", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T14:30:00Z", month: "2026-07", label: "1 Jul 00:30 AEST" },
] as const

const executed: SQL[] = []
const execute = mock.fn(async (q: SQL) => {
  executed.push(q)
  const text = new PgDialect().sqlToQuery(q).sql
  return /FROM finance_run_items/.test(text)
    ? [{ id: 1, period_id: 1, period_month: "2026-11", invoice_reference: "INV-1", amount_cents: 100, adjustment_cents: null, client_id: null, status: "pending" }]
    : []
})
if (typeof mock.module === "function") {
  await mock.module("@/db", { namedExports: { db: { execute }, getDb: () => ({ execute }) } })
}

test("the process zone is UTC in this file, as on Vercel", () => {
  assert.equal(new Date(Date.UTC(2026, 11, 1)).getHours(), 0)
})

for (const { at, month, label } of INSTANTS) {
  test(`billing and payables: a missing billing_month is the Melbourne month (${label})`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const { parseSingleBillingMonthParam } = await import("@/lib/finance/billingApiParams")
    assert.deepEqual(parseSingleBillingMonthParam(null, { defaultWhenMissing: true }), { ok: true, month })
    assert.deepEqual(parseSingleBillingMonthParam("  ", { defaultWhenMissing: true }), { ok: true, month })
  })

  test(`scopes of work: the month picker centres on the Melbourne month (${label})`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const { scopeMonthYearOptions } = await import("@/lib/scopes/scopeListHelpers")
    const options = scopeMonthYearOptions()
    assert.equal(options.length, 25)
    assert.equal(options[12]!.value, month)
  })

  test(`campaign financials: a plan with no burst dates bills the Melbourne month (${label})`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const { computeCampaignFinancials, isoMonthToScheduleMonthYear } = await import("@/lib/finance/computeCampaignFinancials")
    const out = computeCampaignFinancials(
      [{ lineItemId: "L1", mediaType: "search", buyType: "cpc", rate: 1, enteredAmount: 100, budgetIncludesFees: false, clientPaysForMedia: false, feePct: 0, bursts: [], approval: "approved" }],
      { feeLoading: {} as never },
    )
    assert.deepEqual(out.billingSchedule.map((m) => m.monthYear), [isoMonthToScheduleMonthYear(month)])
  })

  test(`Xero match: the month metrics row is the Melbourne month of the run (${label})`, { skip: mockModuleSkip() }, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    executed.length = 0
    const { stageMatchRunItems } = await import("@/lib/xero/stages/matchRunItems")
    const out = await stageMatchRunItems()
    assert.equal(out.ok, true, out.error)
    const insert = executed.map((q) => new PgDialect().sqlToQuery(q)).find((q) => /INSERT INTO xero_match_month_metrics/.test(q.sql))
    assert.ok(insert, "the metrics row is written")
    assert.equal(insert.params[0], `${month}-01`)
  })
}
