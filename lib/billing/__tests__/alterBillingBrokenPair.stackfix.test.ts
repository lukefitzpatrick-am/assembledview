/**
 * STACKfix (stack review M1): zeroing the **current** row of an opened pair
 * also leaves no pair, with the old-id row still billing. Before the fix the
 * original total was rebased anyway, so Save was allowed and the line billed
 * under the ghost id alone. Now the opened total stays, the broken pair is
 * named with the existing message, and the server refuses the same schedule
 * against the stored one.
 *
 * Shape: malay004 v4 (June 2026: malay004ML1 and malay004OH1), plus a real
 * line malay004OH2. Edits go through `applyScheduleLineAmountEdit`, the
 * dialog's cell edit.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  alterBillingGhostPairsLeft,
  alterBillingOriginalTotal,
  billingAliasGhostFinanceMessage,
  billingScheduleAliasGhostRefusal,
  brokenAliasGhostPairs,
  keepCurrentRowsForAlterBilling,
} from "@/lib/billing/billingAliasGhostFinanceGuard"
import {
  billingAliasGhostTotal,
  findBillingAliasGhostPairs,
  summariseBillingAliasGhostPairs,
} from "@/lib/billing/billingAliasGhostPairs"
import { applyScheduleLineAmountEdit } from "@/lib/billing/applyScheduleLineAmountEdit"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const MBA = "malay004"
const JUNE = "June 2026"
const ML1 = "billing-ooh::malay004ML1"
const OH1 = "billing-ooh::malay004OH1"
const OH2 = "billing-ooh::malay004OH2"
const TOLERANCE = 0.01

function opened(ml1 = 37000, oh1 = 37000): BillingMonth[] {
  const rows: BillingLineItem[] = [
    { id: ML1, header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: ml1 }, totalAmount: ml1 },
    { id: OH1, header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: oh1 }, totalAmount: oh1 },
    { id: OH2, header1: "Pub", header2: "Other", monthlyAmounts: { [JUNE]: 10000 }, totalAmount: 10000 },
  ]
  const total = ml1 + oh1 + 10000
  const fmt = `$${total.toLocaleString("en-AU")}.00`
  return [
    {
      monthYear: JUNE,
      mediaTotal: fmt,
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: fmt,
      mediaCosts: { ooh: fmt } as BillingMonth["mediaCosts"],
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

/** The dialog's Save rule with the switch on (pairs left, then the equal-total rule). */
function saveAllowed(o: BillingMonth[], current: BillingMonth[]): boolean {
  if (alterBillingGhostPairsLeft({ openedMonths: o, currentMonths: current, mbaNumber: MBA }).length > 0) return false
  const { originalGrandTotal } = alterBillingOriginalTotal({
    openedMonths: o,
    currentMonths: current,
    mbaNumber: MBA,
    openedGrandTotal: grand(o),
  })
  return Math.abs(grand(current) - originalGrandTotal) <= TOLERANCE
}

/** The message Save shows (the existing finance message), or null. */
function saveMessage(o: BillingMonth[], current: BillingMonth[]): string | null {
  const pairs = alterBillingGhostPairsLeft({ openedMonths: o, currentMonths: current, mbaNumber: MBA })
  const lines = summariseBillingAliasGhostPairs(pairs, current.map((m) => m.monthYear))
  return billingAliasGhostFinanceMessage(lines, billingAliasGhostTotal(pairs))
}

test("M1 probe: current row zeroed, old row keeps $37,000: no pair, but Save is stopped", () => {
  const o = opened()
  const z = edit(o, OH1, 0)
  assert.equal(findBillingAliasGhostPairs(z, MBA).length, 0, "the detector alone finds no pair")
  assert.equal(grand(z), 47000, "the old rebase target, so the equal-total rule alone would pass")
  const broken = brokenAliasGhostPairs({ openedMonths: o, currentMonths: z, mbaNumber: MBA })
  assert.deepEqual(
    broken.map((p) => [p.oldId, p.currentId, p.oldAmount, p.currentAmount]),
    [[ML1, OH1, 37000, 0]],
  )
  const total = alterBillingOriginalTotal({ openedMonths: o, currentMonths: z, mbaNumber: MBA, openedGrandTotal: grand(o) })
  assert.deepEqual(total, { originalGrandTotal: 84000, doubledAsOpened: 37000, rebased: false })
  assert.equal(saveAllowed(o, z), false)
  assert.match(
    saveMessage(o, z) ?? "",
    /^Not saved\. .*malay004ML1 is a duplicate of malay004OH1 \(June 2026 \$37,000\.00 and \$0\.00\)/,
  )
})

test("M1 unequal amounts: current row zeroed and the old row set to the current amount: stopped", () => {
  // Opened ML1 $20,000 beside OH1 $37,000: the old rebase target is $67,000 less $20,000.
  const o = opened(20000, 37000)
  assert.equal(grand(o), 67000)
  const z = edit(edit(o, OH1, 0), ML1, 37000)
  assert.equal(grand(z), 47000, "equals the old rebase target (opened less the old row as opened)")
  assert.equal(findBillingAliasGhostPairs(z, MBA).length, 0)
  assert.equal(
    alterBillingOriginalTotal({ openedMonths: o, currentMonths: z, mbaNumber: MBA, openedGrandTotal: grand(o) }).rebased,
    false,
  )
  assert.equal(saveAllowed(o, z), false)
  // And any amount on the old row with the current row at $0.
  for (const v of [0.01, 1, 20000, 36999.99, 37000, 74000]) {
    assert.equal(saveAllowed(o, edit(edit(o, OH1, 0), ML1, v)), false, `ML1 ${v}`)
  }
})

test("both zeroing paths: old row zeroed is the fix (rebased); current row zeroed is refused", () => {
  const o = opened()
  // Old row zeroed: no broken pair, rebased to $47,000, Save works when the line keeps $37,000.
  const a = edit(o, ML1, 0)
  assert.equal(brokenAliasGhostPairs({ openedMonths: o, currentMonths: a, mbaNumber: MBA }).length, 0)
  assert.equal(
    alterBillingOriginalTotal({ openedMonths: o, currentMonths: a, mbaNumber: MBA, openedGrandTotal: grand(o) }).originalGrandTotal,
    47000,
  )
  assert.equal(saveAllowed(o, a), true)
  // Current row zeroed: refused.
  assert.equal(saveAllowed(o, edit(o, OH1, 0)), false)
  // Both zeroed: rebased, total $10,000 against $47,000: stopped by the total.
  const both = edit(edit(o, OH1, 0), ML1, 0)
  assert.equal(brokenAliasGhostPairs({ openedMonths: o, currentMonths: both, mbaNumber: MBA }).length, 0)
  assert.equal(saveAllowed(o, both), false)
})

test("Keep with the opened schedule drops a broken pair's old row; restoring the current row then saves", () => {
  const o = opened()
  const z = edit(o, OH1, 0)
  const kept = keepCurrentRowsForAlterBilling(z, MBA, o)
  assert.equal(kept.removedTotal, 37000)
  assert.equal(amount(kept.months, ML1), undefined)
  assert.equal(grand(kept.months), 10000)
  assert.equal(saveAllowed(o, kept.months), false, "$10,000 against $47,000")
  const fixed = edit(kept.months, OH1, 37000)
  assert.equal(saveAllowed(o, fixed), true)
  assert.equal(grand(fixed), 47000)
  // Without the opened schedule Keep sees no pair (as before B35fix).
  assert.equal(keepCurrentRowsForAlterBilling(z, MBA).removedTotal, 0)
})

test("a live pair is not also a broken pair: counted once", () => {
  const o = opened()
  for (const current of [o, edit(o, OH1, 20000), edit(o, ML1, 1)]) {
    assert.deepEqual(brokenAliasGhostPairs({ openedMonths: o, currentMonths: current, mbaNumber: MBA }), [])
    const left = alterBillingGhostPairsLeft({ openedMonths: o, currentMonths: current, mbaNumber: MBA })
    assert.equal(left.length, 1)
    assert.equal(billingAliasGhostTotal(left), amount(current, ML1))
  }
})

test("an opened schedule with no pair is untouched: nothing broken, no rebase", () => {
  const clean = keepCurrentRowsForAlterBilling(opened(), MBA).months
  const z = edit(clean, OH1, 0)
  assert.equal(brokenAliasGhostPairs({ openedMonths: clean, currentMonths: z, mbaNumber: MBA }).length, 0)
  assert.deepEqual(alterBillingGhostPairsLeft({ openedMonths: clean, currentMonths: z, mbaNumber: MBA }), [])
})

test("ids are matched bare or billing-prefixed between the opened and the edited schedule", () => {
  const o = opened()
  const bare = edit(o, OH1, 0).map((m) => ({
    ...m,
    lineItems: {
      ooh: ((m.lineItems as Record<string, BillingLineItem[]>).ooh ?? []).map((r) => ({ ...r, id: r.id.replace("billing-ooh::", "") })),
    } as BillingMonth["lineItems"],
  }))
  const broken = brokenAliasGhostPairs({ openedMonths: o, currentMonths: bare, mbaNumber: MBA })
  assert.deepEqual(broken.map((p) => [p.oldId, p.oldAmount]), [["malay004ML1", 37000]], "the id as it sits in the edit")
  assert.equal(keepCurrentRowsForAlterBilling(bare, MBA, o).removedTotal, 37000)
})

test("server: refused against the stored schedule when the current row was zeroed; old row zeroed saves", () => {
  const stored = buildBillingScheduleJSON(opened())
  const brokenSent = buildBillingScheduleJSON(edit(opened(), OH1, 0))
  const refusal = billingScheduleAliasGhostRefusal(brokenSent, MBA, stored)
  assert.ok(refusal)
  assert.equal(refusal.status, 409)
  assert.equal(refusal.body.doubledTotal, 37000)
  assert.match(refusal.body.error, /malay004ML1 is a duplicate of malay004OH1 \(June 2026 \$37,000\.00 and \$0\.00\)/)
  // Without the stored schedule, as before: the sent schedule alone holds no pair.
  assert.equal(billingScheduleAliasGhostRefusal(brokenSent, MBA), null)
  // Old row zeroed: saves.
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(edit(opened(), ML1, 0)), MBA, stored), null)
  // Stored with no pair: an old row billing alone is not this guard's (no stored pair to break).
  const storedClean = buildBillingScheduleJSON(edit(opened(), ML1, 0))
  assert.equal(billingScheduleAliasGhostRefusal(brokenSent, MBA, storedClean), null)
  // A live pair is still refused with or without the stored schedule.
  assert.ok(billingScheduleAliasGhostRefusal(stored, MBA, stored))
  assert.ok(billingScheduleAliasGhostRefusal(stored, MBA, null))
})
