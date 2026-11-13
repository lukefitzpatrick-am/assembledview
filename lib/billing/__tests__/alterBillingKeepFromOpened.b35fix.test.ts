/**
 * B35fix (B35 review H1): Alter Billing's "Keep the current rows" works the
 * original total out from the schedule as opened. Money moved onto or off the
 * old row before Keep is a real change, so the equal-total rule must stop it.
 *
 * Shape: malay004 v4 (June 2026: malay004ML1 and malay004OH1 at $37,000 each),
 * plus a real line malay004OH2 so the schedule is more than the pair. The
 * edits go through `applyScheduleLineAmountEdit`, the dialog's cell edit.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  alterBillingOriginalTotal,
  billingScheduleAliasGhostRefusal,
  keepCurrentRowsForAlterBilling,
} from "@/lib/billing/billingAliasGhostFinanceGuard"
import { findBillingAliasGhostPairs } from "@/lib/billing/billingAliasGhostPairs"
import { applyScheduleLineAmountEdit } from "@/lib/billing/applyScheduleLineAmountEdit"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const JUNE = "June 2026"
const ML1 = "billing-ooh::malay004ML1"
const OH1 = "billing-ooh::malay004OH1"
const OH2 = "billing-ooh::malay004OH2"
const TOLERANCE = 0.01

function opened(): BillingMonth[] {
  const rows: BillingLineItem[] = [
    { id: ML1, header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: 37000 }, totalAmount: 37000 },
    { id: OH1, header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: 37000 }, totalAmount: 37000 },
    { id: OH2, header1: "Pub", header2: "Other", monthlyAmounts: { [JUNE]: 10000 }, totalAmount: 10000 },
  ]
  return [
    {
      monthYear: JUNE,
      mediaTotal: "$84,000.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$84,000.00",
      mediaCosts: { ooh: "$84,000.00" } as BillingMonth["mediaCosts"],
      lineItems: { ooh: rows } as BillingMonth["lineItems"],
    },
  ]
}

const money = (v: unknown) => Number(String(v).replace(/[^0-9.-]/g, ""))
const grand = (months: BillingMonth[]) => months.reduce((s, m) => s + money(m.totalAmount), 0)
const amount = (months: BillingMonth[], id: string) =>
  ((months[0]!.lineItems as Record<string, BillingLineItem[]>).ooh ?? []).find((r) => r.id === id)?.monthlyAmounts[JUNE]

function edit(months: BillingMonth[], id: string, value: number): BillingMonth[] {
  const next = applyScheduleLineAmountEdit(months, { lineItemId: id, monthYear: JUNE, amount: value, stampManual: false })
  assert.ok(next, `edit ${id}`)
  return next
}

/** The dialog's Save rule with the switch on: no pair left, and the total within $0.01 of the original. */
function saveAllowed(openedMonths: BillingMonth[], current: BillingMonth[]): boolean {
  if (findBillingAliasGhostPairs(current, "malay004").length > 0) return false
  const { originalGrandTotal } = alterBillingOriginalTotal({
    openedMonths,
    currentMonths: current,
    mbaNumber: "malay004",
    openedGrandTotal: grand(openedMonths),
  })
  return Math.abs(grand(current) - originalGrandTotal) <= TOLERANCE
}

const keep = (months: BillingMonth[]) => keepCurrentRowsForAlterBilling(months, "malay004").months

test("untouched, then Keep: Save works and the line bills $37,000 once", () => {
  const o = opened()
  const kept = keep(o)
  assert.equal(saveAllowed(o, kept), true)
  assert.equal(amount(kept, ML1), undefined)
  assert.equal(amount(kept, OH1), 37000)
  assert.equal(grand(kept), 47000)
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(kept), "malay004"), null)
})

test("review shape: OH1 down to $20,000 and ML1 up to $54,000, then Keep: Save stays stopped", () => {
  const o = opened()
  const moved = edit(edit(o, OH1, 20000), ML1, 54000)
  assert.equal(grand(moved), grand(o), "the move itself keeps the total")
  const kept = keep(moved)
  assert.equal(amount(kept, OH1), 20000)
  const { originalGrandTotal } = alterBillingOriginalTotal({ openedMonths: o, currentMonths: kept, mbaNumber: "malay004", openedGrandTotal: grand(o) })
  assert.equal(originalGrandTotal, 47000, "original from the rows as opened, not $30,000")
  assert.equal(grand(kept), 30000)
  assert.equal(saveAllowed(o, kept), false)
})

test("reverse: OH1 up to $54,000 and ML1 down to $20,000, then Keep: Save stays stopped", () => {
  const o = opened()
  const kept = keep(edit(edit(o, OH1, 54000), ML1, 20000))
  assert.equal(amount(kept, OH1), 54000)
  assert.equal(grand(kept), 64000)
  assert.equal(saveAllowed(o, kept), false)
})

test("a real change can never pass after Keep", () => {
  const o = opened()
  const shifts = [-37000, -17000, -1, -0.02, 0.02, 1, 17000, 37000]
  for (const d of shifts) {
    // Between the current row and the old row (equal total), then Keep.
    const a = keep(edit(edit(o, OH1, 37000 - d), ML1, 37000 + d))
    assert.equal(saveAllowed(o, a), false, `OH1/ML1 shift ${d}`)
    // Between the old row and a real line (equal total), then Keep.
    const b = keep(edit(edit(o, OH2, 10000 - d), ML1, 37000 + d))
    assert.equal(saveAllowed(o, b), false, `OH2/ML1 shift ${d}`)
    // Old row alone changed, then Keep: the row is dropped whatever it held,
    // so the result is the untouched Keep (no real change) and Save works.
    const c = keep(edit(o, ML1, 37000 + d))
    assert.equal(saveAllowed(o, c), true, `ML1 alone ${d}`)
    assert.deepEqual([amount(c, OH1), amount(c, OH2), grand(c)], [37000, 10000, 47000])
  }
  // The old row zeroed and its money moved onto the current row: no pair left,
  // but the doubled money as opened is still billed. Stopped.
  const z = edit(edit(o, ML1, 0), OH1, 74000)
  assert.equal(findBillingAliasGhostPairs(z, "malay004").length, 0)
  assert.equal(saveAllowed(o, z), false)
  // Keep first, then a move between real lines (equal total): allowed, and the
  // schedule holds the opened total less the doubled money as opened.
  for (const d of shifts) {
    const ok = edit(edit(keep(o), OH2, 10000 - d), OH1, 37000 + d)
    assert.equal(saveAllowed(o, ok), true, `a move between real lines after Keep is still allowed (${d})`)
    assert.equal(grand(ok), 47000)
  }
})

test("opened with no pair: the opened total, and moves between lines work as before", () => {
  const clean = keep(opened())
  const ok = edit(edit(clean, OH1, 42000), OH2, 5000)
  assert.equal(saveAllowed(clean, ok), true)
  assert.deepEqual(
    alterBillingOriginalTotal({ openedMonths: clean, currentMonths: ok, mbaNumber: "malay004", openedGrandTotal: grand(clean) }),
    { originalGrandTotal: 47000, doubledAsOpened: 0, rebased: false },
  )
})
