import assert from "node:assert/strict"
import test from "node:test"

import { parseRevisionParams } from "../revisionParams"

const D = { currentMonth: "2026-10" }

test("PENFOLD020 $100k: dollars to cents, earliest first and current month by default", () => {
  const r = parseRevisionParams(
    { mbaNumber: "PENFOLD020", mode: "bill_amount", amount: 100000, unlockApprovedMonths: ["2026-10"], reason: "Client asked" },
    D,
  )
  assert.ok(r.ok)
  assert.deepEqual(r.value.request, { mode: "bill_amount", intoMonth: "2026-10", amountCents: 10_000_000, strategy: "earliest_first" })
  assert.deepEqual(r.value.options, { unlockApprovedMonths: ["2026-10"], includeProduction: false, feeMode: "follow", adservingMode: "keep" })
})

test("amount strings with $ and commas", () => {
  const r = parseRevisionParams({ mbaNumber: "X", mode: "bill_amount", amount: "$1,234.565", reason: "r" }, D)
  assert.ok(r.ok)
  assert.equal(r.value.request.mode === "bill_amount" && r.value.request.amountCents, 123_457)
})

test("underspend actuals and choices", () => {
  const r = parseRevisionParams(
    {
      mbaNumber: "buxton004",
      mode: "underspend",
      underspendMonth: "2026-09",
      actuals: [{ lineItemId: "buxton004DD5", amount: 1000 }],
      noRemaining: [{ lineItemId: "buxton004DD5", choice: "credit" }],
      reason: "Under delivered",
    },
    D,
  )
  assert.ok(r.ok)
  assert.deepEqual(r.value.request, {
    mode: "underspend",
    month: "2026-09",
    actualByLine: { buxton004DD5: 100_000 },
    noRemaining: { buxton004DD5: "credit" },
  })
})

test("refusals: no reason, bad month, restore from input, bad strategy", () => {
  assert.equal(parseRevisionParams({ mbaNumber: "X", mode: "bill_remainder" }, D).ok, false)
  assert.equal(parseRevisionParams({ mbaNumber: "X", mode: "bill_remainder", intoMonth: "Oct", reason: "r" }, D).ok, false)
  assert.equal(parseRevisionParams({ mbaNumber: "X", mode: "restore", reason: "r" }, D).ok, false)
  assert.equal(parseRevisionParams({ mbaNumber: "X", mode: "bill_amount", amount: 1, strategy: "x", reason: "r" }, D).ok, false)
  assert.equal(parseRevisionParams({ mode: "bill_remainder", reason: "r" }, D).ok, false)
  assert.equal(parseRevisionParams({ mode: "bill_remainder", reason: "r" }, { ...D, mbaNumber: "PAGE" }).ok, true)
})
