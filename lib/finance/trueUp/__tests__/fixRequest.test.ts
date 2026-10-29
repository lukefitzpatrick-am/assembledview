/**
 * Report row -> true_up request -> planner, end to end on live golf025 rows.
 * The fix must set July to September fee to what was invoiced (29 Oct
 * reconciliation) and move the $1,638.93 into the open months.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { planTrueUpRevision } from "@/lib/finance/revisions/planTrueUp"
import { linesFromRows } from "@/lib/finance/revisions/__tests__/fixtures"
import { GOLF025_V40_SUBSET } from "@/lib/finance/revisions/__tests__/trueUpFixtures"

import { buildTrueUpReport } from "../compute.js"
import { buildTrueUpFixRequest, defaultFixComponents, sameTrueUpActuals, trueUpLedgerDrafts } from "../fixRequest.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"

function golf025Row(asOfMonth = "2026-09") {
  const report = buildTrueUpReport({ asOfMonth, fromMonth: "2026-07", plans: PLANS, schedule: SCHEDULE, invoices: INVOICES, matchedRecords: MATCHED_RECORDS })
  const row = report.rows.find((r) => r.mbaNumber === "golf025")
  assert.ok(row)
  return row
}

test("request: counted months get the invoiced fee; months from the current month on are left out", () => {
  const row = golf025Row()
  const built = buildTrueUpFixRequest({ row, asOfMonth: "2026-09", fromMonth: "2026-07", currentMonth: "2026-11", choice: { components: ["fee"], strategy: "spread" } })
  assert.ok(built.ok)
  if (!built.ok) return
  assert.deepEqual(built.request.actuals, { "2026-07": { fee: 99561 }, "2026-08": { fee: 123060 }, "2026-09": { fee: 181002 } })
  assert.equal(built.request.fromMonth, "2026-07")
  assert.ok(defaultFixComponents(row).includes("fee"))
})

test("end to end: golf025 fee residual 0, past months equal Xero, ledger rows drafted", () => {
  const row = golf025Row()
  const built = buildTrueUpFixRequest({ row, asOfMonth: "2026-09", fromMonth: "2026-07", currentMonth: "2026-11", choice: { components: ["fee"], strategy: "spread" } })
  assert.ok(built.ok)
  if (!built.ok) return
  const plan = planTrueUpRevision({
    lines: linesFromRows(GOLF025_V40_SUBSET),
    locks: [],
    currentMonth: "2026-11",
    campaignMonths: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"],
    request: built.request,
    options: { unlockApprovedMonths: [], includeProduction: true, feeMode: "keep", adservingMode: "keep" },
  })
  assert.ok(plan.ok)
  if (!plan.ok) return
  for (const m of ["2026-07", "2026-08", "2026-09"]) {
    assert.equal(plan.months.find((x) => x.month === m)!.fee.after, built.request.actuals[m]!.fee)
  }
  const drafts = trueUpLedgerDrafts({ mbaNumber: "golf025", request: built.request, plan })
  assert.deepEqual(drafts.map((d) => [d.component, d.action, d.gapCents, d.amountCents]), [["fee", "schedule", -163893, 0]])
})

test("a no-invoice month can be carried; a month with an invoice can't", () => {
  const row = golf025Row("2026-10")
  const ok = buildTrueUpFixRequest({
    row,
    asOfMonth: "2026-10",
    fromMonth: "2026-07",
    currentMonth: "2026-11",
    choice: { components: ["fee"], strategy: "carry", noInvoiceMonths: ["2026-10"] },
  })
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.deepEqual(ok.request.actuals["2026-10"], { fee: 0 })
    assert.deepEqual(ok.request.noInvoiceMonths, ["2026-10"])
  }
  const bad = buildTrueUpFixRequest({
    row,
    asOfMonth: "2026-10",
    fromMonth: "2026-07",
    currentMonth: "2026-11",
    choice: { components: ["fee"], strategy: "carry", noInvoiceMonths: ["2026-09"] },
  })
  assert.equal(bad.ok, false)
})

test("stale check compares every month and component", () => {
  const a = { mode: "true_up" as const, asOfMonth: "2026-09", strategy: "spread" as const, components: ["fee" as const], actuals: { "2026-09": { fee: 100 } } }
  assert.equal(sameTrueUpActuals(a, { ...a, actuals: { "2026-09": { fee: 100 } } }), true)
  assert.equal(sameTrueUpActuals(a, { ...a, actuals: { "2026-09": { fee: 101 } } }), false)
  assert.equal(sameTrueUpActuals(a, { ...a, actuals: { "2026-09": { fee: 100 }, "2026-08": { fee: 0 } } }), false)
})

test("residual of $1 or more drafts a one-off to raise", () => {
  const request = { mode: "true_up" as const, asOfMonth: "2026-09", strategy: "spread" as const, components: ["adserving" as const], actuals: { "2026-09": { adserving: 0 } } }
  const plan = {
    trueUp: { asOfMonth: "2026-09", strategy: "spread" as const, months: ["2026-09"], components: [{ component: "adserving" as const, gapBefore: 5000, residual: 345, rebalanced: 4655 }] },
  }
  const drafts = trueUpLedgerDrafts({ mbaNumber: "x", request, plan: plan as never })
  assert.deepEqual(drafts.map((d) => [d.action, d.amountCents]), [["schedule", 345], ["one_off", 345]])
})
