/**
 * C-157 hard block: a full billing reset, or an override write, may not move a
 * month an applied true-up schedule fix set to what Xero invoiced.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  normaliseLockMonth,
  overrideLockConflicts,
  parseTrueUpLocks,
  replaceSetLockConflicts,
  scheduleLockConflicts,
  trueUpLockMessage,
  type TrueUpLock,
} from "../resetGuard"

const LOCKS: TrueUpLock[] = [{ actionId: 1, component: "fee", months: ["2026-07", "2026-08", "2026-09"], asOfMonth: "2026-09" }]

test("months: ISO, first-of-month dates and schedule labels", () => {
  assert.equal(normaliseLockMonth("2026-07"), "2026-07")
  assert.equal(normaliseLockMonth("2026-07-01"), "2026-07")
  assert.equal(normaliseLockMonth("July 2026"), "2026-07")
  assert.equal(normaliseLockMonth("Sept 2026"), null)
})

test("locks parse from ledger rows, including a Postgres text[] string", () => {
  const locks = parseTrueUpLocks([
    { id: 5, component: "fee", months: "{2026-07,2026-08}", as_of_month: "2026-08" },
    { id: 6, component: "media", months: ["2026-09"], as_of_month: "2026-09" },
    { id: 7, component: "bogus", months: ["2026-09"] },
    { id: 8, component: "fee", months: [] },
  ])
  assert.deepEqual(locks.map((l) => [l.actionId, l.component, l.months]), [[5, "fee", ["2026-07", "2026-08"]], [6, "media", ["2026-09"]]])
})

const month = (monthYear: string, fee: string, media = "$1,000.00") => ({ monthYear, feeTotal: fee, mediaTotal: media, adservingTechFees: "$0.00", production: "$0.00" })

test("editor reset: a reset that moves a locked fee month is a conflict; unlocked months and components are not", () => {
  const working = [month("July 2026", "$100.00"), month("August 2026", "$250.00"), month("November 2026", "$400.00")]
  const auto = [month("July 2026", "$250.00"), month("August 2026", "$250.00"), month("November 2026", "$250.00", "$900.00")]
  const c = scheduleLockConflicts(LOCKS, working, auto)
  assert.deepEqual(c.map((x) => [x.component, x.month, x.beforeCents, x.afterCents]), [["fee", "2026-07", 10000, 25000]])
  assert.deepEqual(scheduleLockConflicts(LOCKS, working, working), [])
  assert.deepEqual(scheduleLockConflicts([], working, auto), [])
})

const row = (lineItemId: string, component: string, months: Array<[string, number]>) => ({
  lineItemId,
  component,
  months: months.map(([m, amount]) => ({ month: m, amount })),
})

test("override writes: deleting or changing a locked month conflicts; same amounts, or other months, do not", () => {
  const before = [row("G025SM1", "fee", [["2026-07", 100], ["2026-11", 400]]), row("G025SM1", "media", [["2026-07", 1000]])]
  assert.equal(overrideLockConflicts(LOCKS, before, []).length, 1, "reset_line deletes the fee row")
  assert.equal(overrideLockConflicts(LOCKS, before, [row("G025SM1", "fee", [["2026-07", 100], ["2026-11", 300], ["2026-12", 100]])]).length, 0, "only an open month moved")
  assert.equal(overrideLockConflicts(LOCKS, before, [row("G025SM1", "fee", [["2026-07", 150], ["2026-11", 350]])]).length, 1)
  assert.equal(overrideLockConflicts(LOCKS, [before[1]!], []).length, 0, "media is not locked")
})

test("save REPLACE-SET: a full reset (payload line without its override) is refused; the same override is kept", () => {
  const existing = [row("billing-socialMedia::G025SM1", "fee", [["2026-07", 100]]), row("G025DD1", "fee", [["2026-07", 50]])]
  const canon = (id: string) => id.replace(/^billing-[^:]+::/, "")
  const isReplaced = (r: { lineItemId: string }) => canon(r.lineItemId) === "G025SM1"
  const reset = replaceSetLockConflicts({ locks: LOCKS, existing, isReplaced, inserts: [], canon })
  assert.deepEqual(reset.map((c) => [c.lineItemId, c.month]), [["G025SM1", "2026-07"]])
  const kept = replaceSetLockConflicts({ locks: LOCKS, existing, isReplaced, inserts: [row("G025SM1", "fee", [["2026-07", 100]])], canon })
  assert.deepEqual(kept, [])
  assert.deepEqual(replaceSetLockConflicts({ locks: [], existing, isReplaced, inserts: [], canon }), [])
})

test("message: tells the user to undo the true-up first, Australian English, no em dashes", () => {
  const msg = trueUpLockMessage([{ component: "fee", month: "2026-07" }, { component: "fee", month: "2026-08" }])
  assert.match(msg, /Undo the true-up first on Finance > Reports > True-up/)
  assert.match(msg, /fee, Jul 2026, Aug 2026/)
  assert.equal(/—/.test(msg), false)
})

test("twin pages: both editors check the MBA's true-up locks before a full reset", async () => {
  const fs = await import("node:fs")
  for (const page of ["app/mediaplans/mba/[mba_number]/edit/page.tsx", "app/mediaplans/create/page.tsx"]) {
    const src = fs.readFileSync(page, "utf8")
    const start = src.indexOf("const runConfirmedFullBillingResetToAuto = useCallback(async () => {")
    assert.ok(start > 0, `${page}: async reset handler`)
    const body = src.slice(start, start + 1200)
    assert.match(body, /fetchTrueUpLocks\(/, page)
    assert.match(body, /trueUpLockMessage|handleResetBillingScheduleToAuto\(trueUpLocks\)/, page)
  }
})
