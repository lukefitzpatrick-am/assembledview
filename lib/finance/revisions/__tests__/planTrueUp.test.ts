/**
 * True-up planner (planTrueUp). Golden case on golf025 v40's live billing
 * rows (subset: the fee lines, a production-free display line with ad
 * serving), read 29 Oct 2026, against the 29 Oct fee reconciliation:
 * golf025 fee July to September is $1,638.93 under-invoiced
 * (Jul -4.39, Aug -1,039.15, Sep -595.39).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { planBillingRevision } from "../planBillingRevision"
import { isProductionLikeLine, planTrueUpRevision } from "../planTrueUp"
import type { MonthLock, RevisionInput, RevisionLine, RevisionOk, RevisionResult, TrueUpRequest } from "../types"
import { linesFromRows } from "./fixtures"
import { GOLF025_V40_SUBSET } from "./trueUpFixtures"

const CAMPAIGN = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
const OPTIONS = { unlockApprovedMonths: [] as string[], includeProduction: false, feeMode: "keep" as const, adservingMode: "keep" as const }

function input(
  request: RevisionInput["request"],
  over: Partial<RevisionInput> = {},
  lines: RevisionLine[] = linesFromRows(GOLF025_V40_SUBSET),
): RevisionInput {
  return {
    lines,
    locks: [],
    currentMonth: "2026-11",
    campaignMonths: CAMPAIGN,
    request,
    options: OPTIONS,
    ...over,
  }
}

function ok(r: RevisionResult): RevisionOk {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

function sumMonth(r: RevisionOk, comp: "fee" | "media" | "adserving", month: string): number {
  return r.months.find((m) => m.month === month)?.[comp].after ?? 0
}

function lineTotal(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((s, v) => s + v, 0)
}

const FEE_ACTUALS: TrueUpRequest["actuals"] = {
  "2026-07": { fee: 99561 },
  "2026-08": { fee: 123060 },
  "2026-09": { fee: 181002 },
}

const NOV_BEFORE = 145455 + 81818 + 45455 + 36932 * 2
const DEC_BEFORE = 14545 + 8182 + 4545 + 3693 * 2

test("golf025 fee (default carry): past months become what was invoiced, November takes the $1,638.93", () => {
  const before = linesFromRows(GOLF025_V40_SUBSET)
  const r = ok(planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-09", strategy: "carry", components: ["fee"], actuals: FEE_ACTUALS })))
  assert.equal(sumMonth(r, "fee", "2026-07"), 99561)
  assert.equal(sumMonth(r, "fee", "2026-08"), 123060)
  assert.equal(sumMonth(r, "fee", "2026-09"), 181002)
  // October is past and not listed: untouched.
  assert.equal(sumMonth(r, "fee", "2026-10"), 351234)
  // Luke, 29 Oct: rectified in the next month. November takes it all, December is unchanged.
  assert.equal(sumMonth(r, "fee", "2026-11"), NOV_BEFORE + 163893)
  assert.equal(sumMonth(r, "fee", "2026-12"), DEC_BEFORE)
  // Every line keeps its fee, media and ad serving totals.
  for (const c of r.afterCells) {
    const b = before.find((l) => l.lineItemId === c.lineItemId)!
    assert.equal(lineTotal(c.fee), lineTotal(b.fee), `${c.lineItemId} fee total`)
    assert.equal(lineTotal(c.media), lineTotal(b.media), `${c.lineItemId} media total`)
    assert.equal(c.mediaChanged, false)
  }
  const fee = r.trueUp!.components.find((x) => x.component === "fee")!
  assert.equal(fee.gapBefore, -163893)
  assert.equal(fee.residual, 0)
  assert.equal(fee.rebalanced, 163893)
})

test("spread (option) shares the $1,638.93 over November and December pro rata", () => {
  const r = ok(planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: FEE_ACTUALS })))
  assert.equal(sumMonth(r, "fee", "2026-11") + sumMonth(r, "fee", "2026-12"), NOV_BEFORE + DEC_BEFORE + 163893)
  assert.ok(sumMonth(r, "fee", "2026-12") > DEC_BEFORE)
  assert.equal(sumMonth(r, "fee", "2026-09"), 181002)
  assert.equal(r.trueUp!.components[0]!.residual, 0)
})

function feeLine(id: string, fee: Record<string, number>): RevisionLine {
  return { lineItemId: id, label: id, channel: "socialMedia", isProduction: false, clientPaysForMedia: false, isAaLine: false, media: {}, fee, adserving: {} }
}

test("room first: an over-invoiced month goes to the line that can give it back, so nothing is left over", () => {
  // A has no open month left; B holds $10.00 in November. August invoiced $3.00 against $2.00 scheduled.
  const lines = [feeLine("x001SM1", { "2026-08": 100 }), feeLine("x001SM2", { "2026-08": 100, "2026-11": 1000 })]
  const r = ok(planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-09", strategy: "carry", components: ["fee"], actuals: { "2026-08": { fee: 300 } } }, {}, lines)))
  const a = r.afterCells.find((c) => c.lineItemId === "x001SM1")
  const b = r.afterCells.find((c) => c.lineItemId === "x001SM2")!
  assert.equal(a, undefined, "A unchanged")
  assert.deepEqual(b.fee, { "2026-08": 200, "2026-11": 900 })
  assert.equal(r.trueUp!.components[0]!.residual, 0)
})

test("room first: an under-invoiced month comes off the line that can take it back into an open month", () => {
  // A is an AA line whose November and December sit in a sent AA pack: it has no open month to take a credit back into.
  const lines = [{ ...feeLine("x001SM1", { "2026-08": 1000 }), isAaLine: true }, feeLine("x001SM2", { "2026-08": 1000, "2026-11": 1000 })]
  const r = ok(
    planTrueUpRevision(
      input({ mode: "true_up", asOfMonth: "2026-09", strategy: "carry", components: ["fee"], actuals: { "2026-08": { fee: 1000 } } }, { aaLockedMonths: ["2026-11", "2026-12"] }, lines),
    ),
  )
  assert.equal(r.afterCells.find((c) => c.lineItemId === "x001SM1"), undefined)
  assert.deepEqual(r.afterCells.find((c) => c.lineItemId === "x001SM2")!.fee, { "2026-11": 2000 })
  assert.equal(r.trueUp!.components[0]!.residual, 0)
})

test("carry rolls on: what the next open month can't give back comes from the following months", () => {
  const lines = [feeLine("x001SM2", { "2026-08": 100, "2026-11": 30, "2026-12": 100 })]
  const r = ok(planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-09", strategy: "carry", components: ["fee"], actuals: { "2026-08": { fee: 200 } } }, {}, lines)))
  assert.deepEqual(r.afterCells[0]!.fee, { "2026-08": 200, "2026-12": 30 })
  assert.equal(r.trueUp!.components[0]!.residual, 0)
})

test("over-invoiced beyond the open months: the schedule stops at the contract, the rest is a credit to raise", () => {
  // SM1 fee: Aug 682.50, Sep 796.25, Oct 341.50, no Nov or Dec. Invoice Aug at 2,500.00 for SM1 alone.
  const lines = linesFromRows(GOLF025_V40_SUBSET.filter((r) => r[0] === "golf025SM1"))
  const r = ok(
    planTrueUpRevision(
      input(
        { mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: { "2026-08": { fee: 250000 } } },
        { currentMonth: "2026-10" },
        lines,
      ),
    ),
  )
  // Oct (open) gives back all 341.50 it holds; the rest can't be absorbed.
  const after = r.afterCells[0]!
  assert.equal(after.fee["2026-10"] ?? 0, 0)
  assert.equal(after.fee["2026-08"], 68250 + 34150)
  assert.equal(lineTotal(after.fee), 68250 + 79625 + 34150)
  const fee = r.trueUp!.components[0]!
  assert.equal(fee.gapBefore, 250000 - 68250)
  assert.equal(fee.residual, 250000 - 68250 - 34150)
  assert.ok(r.warnings.some((w) => w.code === "TRUE_UP_RESIDUAL"))
})

test("ended campaign under-invoiced: nothing open, the whole gap is a charge to raise and no version", () => {
  const lines = linesFromRows(GOLF025_V40_SUBSET.filter((r) => r[0] === "golf025SM1"))
  const r = planTrueUpRevision(
    input(
      { mode: "true_up", asOfMonth: "2026-10", strategy: "spread", components: ["fee"], actuals: { "2026-08": { fee: 50000 }, "2026-09": { fee: 79625 }, "2026-10": { fee: 34150 } } },
      { currentMonth: "2027-01" },
      lines,
    ),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "NO_CHANGE")
})

test("timing only on an ended campaign: months swap, totals equal, a version is cut", () => {
  const lines = linesFromRows(GOLF025_V40_SUBSET.filter((r) => r[0] === "golf025SM1"))
  // Invoiced Aug 1,478.75 (Aug + Sep fee), Sep 0, Oct 341.50.
  const r = ok(
    planTrueUpRevision(
      input(
        { mode: "true_up", asOfMonth: "2026-10", strategy: "spread", components: ["fee"], actuals: { "2026-08": { fee: 147875 }, "2026-09": { fee: 0 }, "2026-10": { fee: 34150 } } },
        { currentMonth: "2027-01" },
        lines,
      ),
    ),
  )
  const after = r.afterCells[0]!
  assert.equal(after.fee["2026-08"], 147875)
  assert.equal(after.fee["2026-09"] ?? 0, 0)
  assert.equal(r.trueUp!.components[0]!.residual, 0)
})

test("a no-invoice month carried (zeros) moves its schedule into the next open month", () => {
  const r = ok(
    planTrueUpRevision(
      input({
        mode: "true_up",
        asOfMonth: "2026-10",
        strategy: "carry",
        components: ["fee", "adserving", "media", "production"],
        actuals: { "2026-10": { fee: 0, adserving: 0, media: 0, production: 0 } },
      }),
    ),
  )
  for (const comp of ["fee", "media", "adserving"] as const) assert.equal(sumMonth(r, comp, "2026-10"), 0, comp)
  // Fee 3,512.34, ad serving on the subset's lines, media all land in November (next open month).
  assert.equal(sumMonth(r, "fee", "2026-11"), 145455 + 81818 + 45455 + 36932 * 2 + 351234)
})

test("ad serving moves like fee, and the after cells carry it for the writer", () => {
  const r = ok(
    planTrueUpRevision(
      input({ mode: "true_up", asOfMonth: "2026-10", strategy: "spread", components: ["adserving"], actuals: { "2026-09": { adserving: 0 }, "2026-10": { adserving: 5000 } } }),
    ),
  )
  const dd13 = r.afterCells.find((c) => c.lineItemId === "golf025DD13")!
  assert.equal(dd13.adservingChanged, true)
  assert.equal(dd13.adserving!["2026-09"] ?? 0, 0)
  assert.equal(lineTotal(dd13.adserving), 42 + 623 + 789 + 623 + 104)
  // Room first: the lines' November and December ad serving (21.94) is all
  // the schedule can give back. Only the 1.08 above it is a credit to raise.
  const ad = r.trueUp!.components[0]!
  assert.equal(ad.gapBefore, 5000 - 2075 - 623)
  assert.equal(ad.residual, 5000 - 2075 - 623 - (767 + 128 + 520 + 52 + 623 + 104))
  assert.equal(sumMonth(r, "adserving", "2026-10"), 5000 - ad.residual)
  assert.equal(sumMonth(r, "adserving", "2026-09"), 0)
})

test("a closed finance period and a sent AA pack month stay as they are", () => {
  const locks: MonthLock[] = [{ month: "2026-08", level: "hard", reasons: ["past_month", "finance_period_locked"], past: true }]
  const r = ok(planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: FEE_ACTUALS }, { locks })))
  assert.equal(sumMonth(r, "fee", "2026-08"), 226975)
  assert.ok(r.warnings.some((w) => w.code === "TRUE_UP_MONTH_LOCKED" && w.month === "2026-08"))
  // SM2 is the only fee line in July; with July in a sent AA pack, nothing moves.
  const aaLines = linesFromRows(GOLF025_V40_SUBSET, ["golf025SM2"])
  const r2 = planTrueUpRevision(
    input({ mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: { "2026-07": { fee: 50000 } } }, { aaLockedMonths: ["2026-07"] }, aaLines),
  )
  assert.equal(r2.ok, false)
})

test("under $1 everywhere: no version", () => {
  const r = planTrueUpRevision(
    input({ mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: { "2026-07": { fee: 99950 } } }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "NO_CHANGE")
})

test("fixed header cells count toward the month and never change", () => {
  const r = ok(
    planTrueUpRevision(
      input(
        { mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: { "2026-09": { fee: 240541 + 50000 - 20000 } } },
        { fixedCells: { fee: { "2026-09": 50000 } } },
      ),
    ),
  )
  assert.equal(sumMonth(r, "fee", "2026-09"), 240541 + 50000 - 20000)
})

test("refuses a month that isn't past, and a month after the as-of month", () => {
  const a = planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-11", strategy: "spread", components: ["fee"], actuals: { "2026-11": { fee: 1 } } }))
  assert.equal(a.ok, false)
  const b = planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-08", strategy: "spread", components: ["fee"], actuals: { "2026-09": { fee: 1 } } }))
  assert.equal(b.ok, false)
})

test("planBillingRevision sends true-up requests to the true-up planner, same hash", () => {
  const req = { mode: "true_up" as const, asOfMonth: "2026-09", strategy: "spread" as const, components: ["fee" as const], actuals: FEE_ACTUALS }
  const a = ok(planBillingRevision(input(req)))
  const b = ok(planTrueUpRevision(input(req)))
  assert.equal(a.hash, b.hash)
})

test("undo puts every cell back while the open months are still open", () => {
  const before = linesFromRows(GOLF025_V40_SUBSET)
  const fix = ok(planTrueUpRevision(input({ mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: FEE_ACTUALS })))
  // Apply the fix to the lines, then undo.
  const afterLines = before.map((l) => {
    const c = fix.afterCells.find((x) => x.lineItemId === l.lineItemId)
    return c ? { ...l, media: { ...c.media }, fee: { ...c.fee }, adserving: { ...(c.adserving ?? {}) } } : l
  })
  const target = { media: {} as Record<string, Record<string, number>>, fee: {} as Record<string, Record<string, number>> }
  for (const c of fix.afterCells) {
    const b = before.find((l) => l.lineItemId === c.lineItemId)!
    const fee: Record<string, number> = {}
    for (const m of new Set([...Object.keys(b.fee), ...Object.keys(c.fee)])) fee[m] = b.fee[m] ?? 0
    target.fee[c.lineItemId] = fee
  }
  const undo = ok(planTrueUpRevision(input({ mode: "true_up_restore", target, fixedAtMonth: "2026-11" }, {}, afterLines)))
  for (const c of undo.afterCells) {
    const b = before.find((l) => l.lineItemId === c.lineItemId)!
    for (const m of new Set([...Object.keys(b.fee), ...Object.keys(c.fee)])) assert.equal(c.fee[m] ?? 0, b.fee[m] ?? 0, `${c.lineItemId} ${m}`)
  }
  // Once November is invoiced (hard), the undo is refused whole.
  const locked: MonthLock[] = [{ month: "2026-11", level: "hard", reasons: ["sent_to_accounts"], past: false }]
  const refused = planTrueUpRevision(input({ mode: "true_up_restore", target, fixedAtMonth: "2026-11" }, { locks: locked }, afterLines))
  assert.equal(refused.ok, false)
})

test("production lines: the production channel and PROD line ids, never media", () => {
  assert.equal(isProductionLikeLine({ lineItemId: "hartm015PROD2", isProduction: false }), true)
  assert.equal(isProductionLikeLine({ lineItemId: "billing-production::x1", isProduction: false }), true)
  assert.equal(isProductionLikeLine({ lineItemId: "golf025SM1", isProduction: false }), false)
  assert.equal(isProductionLikeLine({ lineItemId: "golf025X", isProduction: true }), true)
})

test("the other kinds keep their laws: ad serving never moves and no true-up summary", () => {
  const r = ok(
    planBillingRevision(
      input(
        { mode: "bill_amount", intoMonth: "2026-11", amountCents: 10000, strategy: "earliest_first" },
        { options: { ...OPTIONS, feeMode: "follow" } },
      ),
    ),
  )
  for (const c of r.afterCells) {
    assert.equal(c.adserving, undefined)
    assert.equal(c.adservingChanged, undefined)
  }
  assert.equal(r.trueUp, undefined)
  for (const l of r.lines) assert.equal(l.adserving.length, 0)
})
