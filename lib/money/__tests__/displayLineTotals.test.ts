import assert from "node:assert/strict"
import test from "node:test"

import { displayLineTotals } from "@/lib/money/burst"

test("gross-in 1000 at 15% is 850 media and 150 fee", () => {
  const shown = displayLineTotals(
    {
      buyType: "cpm",
      budgetIncludesFees: true,
      bursts: [{ budget: 1000 }],
    },
    { feePct: 15 },
  )
  assert.equal(shown.mediaCents, 85000)
  assert.equal(shown.feeCents, 15000)
  assert.equal(shown.totalCents, 100000)
  assert.equal(shown.clientPaid, false)
  assert.equal(shown.invalidNetFee, false)
})

test("bonus with a budget is zero media and fee", () => {
  const shown = displayLineTotals(
    { buyType: "bonus", bursts: [{ budget: 1000 }] },
    { feePct: 15 },
  )
  assert.equal(shown.mediaCents, 0)
  assert.equal(shown.feeCents, 0)
  assert.equal(shown.clientPaid, false)
})

test("package inclusions are zero, package is not", () => {
  const inclusions = displayLineTotals(
    { buyType: "package_inclusions", budgetIncludesFees: true, bursts: [{ budget: 1000 }] },
    { feePct: 15 },
  )
  assert.equal(inclusions.mediaCents, 0)
  assert.equal(inclusions.feeCents, 0)

  const pkg = displayLineTotals(
    { buyType: "package", budgetIncludesFees: true, bursts: [{ budget: 1000 }] },
    { feePct: 15 },
  )
  assert.equal(pkg.mediaCents, 85000)
  assert.equal(pkg.feeCents, 15000)
})

test("client-pays shows planned media plus the grossed-up fee", () => {
  const shown = displayLineTotals(
    {
      buyType: "cpm",
      clientPaysForMedia: true,
      bursts: [{ budget: 1000 }],
    },
    { feePct: 15 },
  )
  assert.equal(shown.mediaCents, 100000)
  assert.equal(shown.feeCents, 17647)
  assert.equal(shown.totalCents, 117647)
  assert.equal(shown.clientPaid, true)
})

test("a 100% fee on a net budget is fee zero and invalid", () => {
  const shown = displayLineTotals(
    { buyType: "cpm", bursts: [{ budget: 1000 }] },
    { feePct: 100 },
  )
  assert.equal(shown.mediaCents, 100000)
  assert.equal(shown.feeCents, 0)
  assert.equal(shown.invalidNetFee, true)
})
