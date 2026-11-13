/**
 * B35 (MB-37): the duplicate-row check on the finance side. A schedule sent by
 * Alter Billing or an inline invoice edit (buildBillingScheduleJSON) that holds
 * an old ML id and its current id with money in one month is refused, naming
 * the line, month and both amounts. Invoice draft months flag the pair.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  BILLING_ALIAS_GHOST_ROWS_CODE,
  billingScheduleAliasGhostRefusal,
  describeInvoiceDraftAliasDuplicates,
  invoiceDraftAliasDuplicates,
  keepCurrentRowsForAlterBilling,
  alterBillingOriginalTotal,
} from "@/lib/billing/billingAliasGhostFinanceGuard"
import { removeOldAliasGhostRows, findBillingAliasGhostPairs } from "@/lib/billing/billingAliasGhostPairs"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const JUNE = "June 2026"
const MAY = "May 2026"

function line(id: string, amounts: Record<string, number>): BillingLineItem {
  return { id, header1: "Pub", header2: "Site", monthlyAmounts: amounts, totalAmount: Object.values(amounts).reduce((s, v) => s + v, 0) }
}

function month(monthYear: string, rows: BillingLineItem[], mediaKey = "ooh"): BillingMonth {
  const media = rows.reduce((s, r) => s + (r.monthlyAmounts[monthYear] ?? 0), 0)
  const fmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
  return {
    monthYear,
    mediaTotal: fmt.format(media),
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: fmt.format(media),
    mediaCosts: { [mediaKey]: fmt.format(media) } as BillingMonth["mediaCosts"],
    lineItems: { [mediaKey]: rows } as BillingMonth["lineItems"],
  }
}

// malay004 v4 shape: ML1 beside OH1, $37,000 each in June.
const malay004 = [
  month(JUNE, [line("billing-ooh::malay004ML1", { [JUNE]: 37000 }), line("billing-ooh::malay004OH1", { [JUNE]: 37000 })]),
]

test("a sent schedule with ML1 beside OH1 is refused, naming the line, month and both amounts", () => {
  const refusal = billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(malay004), "malay004")
  assert.ok(refusal)
  assert.equal(refusal.status, 409)
  assert.equal(refusal.body.code, BILLING_ALIAS_GHOST_ROWS_CODE)
  assert.equal(refusal.body.doubledTotal, 37000)
  assert.equal(refusal.body.lines.length, 1)
  assert.match(refusal.body.error, /^Not saved\./)
  assert.match(refusal.body.error, /\$37,000\.00 is counted twice/)
  assert.match(refusal.body.error, /malay004ML1 is a duplicate of malay004OH1 \(June 2026 \$37,000\.00 and \$37,000\.00\)/)
  assert.match(refusal.body.error, /Keep the current rows/)
  // A JSON string or { months } wrapper is read the same way.
  assert.ok(billingScheduleAliasGhostRefusal(JSON.stringify(buildBillingScheduleJSON(malay004)), "malay004"))
  assert.ok(billingScheduleAliasGhostRefusal({ months: buildBillingScheduleJSON(malay004) }, "MALAY004"))
})

test("after Keep the current rows the same schedule passes", () => {
  const kept = removeOldAliasGhostRows(malay004, findBillingAliasGhostPairs(malay004, "malay004"))
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(kept), "malay004"), null)
})

test("no refusal: old id alone, current id alone, different months, $0 rows, blank MBA, unparseable", () => {
  const oldOnly = [month(JUNE, [line("malay004ML1", { [JUNE]: 37000 })])]
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(oldOnly), "malay004"), null)
  const split = [
    month(MAY, [line("malay004ML1", { [MAY]: 100 })]),
    month(JUNE, [line("malay004OH1", { [JUNE]: 100 })]),
  ]
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(split), "malay004"), null)
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(malay004), ""), null)
  assert.equal(billingScheduleAliasGhostRefusal("not json", "malay004"), null)
  assert.equal(billingScheduleAliasGhostRefusal(null, "malay004"), null)
})

test("no-code ids are not checked on the finance side (MB-40: no loaded lines to prove the number)", () => {
  const social = [
    month(JUNE, [line("PGAAUS0051", { [JUNE]: 500 }), line("PGAAUS005SM1", { [JUNE]: 500 })], "socialMedia"),
  ]
  assert.equal(billingScheduleAliasGhostRefusal(buildBillingScheduleJSON(social), "PGAAUS005"), null)
})

test("message lists five lines, then a count", () => {
  const rows: BillingLineItem[] = []
  for (let n = 1; n <= 7; n += 1) {
    rows.push(line(`hema001ML${n}`, { [JUNE]: n }), line(`hema001DD${n}`, { [JUNE]: n }))
  }
  const refusal = billingScheduleAliasGhostRefusal(buildBillingScheduleJSON([month(JUNE, rows, "digiDisplay")]), "hema001")
  assert.ok(refusal)
  assert.equal(refusal.body.lines.length, 7)
  assert.equal(refusal.body.doubledTotal, 28)
  assert.match(refusal.body.error, /And 2 more line\(s\)/)
})

test("invoice draft month: doubled lines are named with both amounts, nothing dropped", () => {
  const m = malay004[0]!
  const dups = invoiceDraftAliasDuplicates(m, "malay004")
  assert.deepEqual(dups, [
    { mediaKey: "ooh", oldId: "malay004ML1", currentId: "malay004OH1", oldAmount: 37000, currentAmount: 37000 },
  ])
  assert.equal(
    describeInvoiceDraftAliasDuplicates(dups),
    "Counted twice: malay004ML1 duplicates malay004OH1 ($37,000.00 too much on this invoice). Fix the plan's billing before raising it.",
  )
  // The month is not changed.
  assert.equal((m.lineItems as Record<string, BillingLineItem[]>).ooh!.length, 2)
  assert.deepEqual(invoiceDraftAliasDuplicates(null, "malay004"), [])
  assert.deepEqual(invoiceDraftAliasDuplicates(month(JUNE, [line("malay004OH1", { [JUNE]: 1 })]), "malay004"), [])
})

test("invoice flag text names three, then a count", () => {
  const dups = [1, 2, 3, 4].map((n) => ({ mediaKey: "digiDisplay", oldId: `h${n}ML`, currentId: `h${n}DD`, oldAmount: 0.1, currentAmount: 0.1 }))
  assert.equal(
    describeInvoiceDraftAliasDuplicates(dups),
    "Counted twice: h1ML duplicates h1DD; h2ML duplicates h2DD; h3ML duplicates h3DD; and 1 more ($0.40 too much on this invoice). Fix the plan's billing before raising it.",
  )
})

test("Alter Billing keep the current rows: old rows go; the original total drops by the old rows as opened", () => {
  const hema = [
    month(MAY, [line("hema001ML4", { [MAY]: 3 }), line("hema001DD4", { [MAY]: 3 }), line("hema001DD5", { [MAY]: 10.1 })], "digiDisplay"),
    month(JUNE, [line("hema001ML6", { [JUNE]: 34 }), line("hema001DD6", { [JUNE]: 34 })], "digiDisplay"),
  ]
  const r = keepCurrentRowsForAlterBilling(hema, "hema001")
  assert.equal(r.removedTotal, 37)
  assert.deepEqual(
    r.months.map((m) => (m.lineItems as Record<string, BillingLineItem[]>).digiDisplay!.map((l) => l.id)),
    [["hema001DD4", "hema001DD5"], ["hema001DD6"]],
  )
  assert.deepEqual(r.months.map((m) => m.totalAmount), ["$13.10", "$34.00"])
  const original = alterBillingOriginalTotal({ openedMonths: hema, currentMonths: r.months, mbaNumber: "hema001", openedGrandTotal: 84.1 })
  assert.deepEqual(original, { originalGrandTotal: 47.1, doubledAsOpened: 37, rebased: true })
  // The input is not changed, and a clean schedule comes back as it is.
  assert.equal((hema[0]!.lineItems as Record<string, BillingLineItem[]>).digiDisplay!.length, 3)
  const again = keepCurrentRowsForAlterBilling(r.months, "hema001")
  assert.equal(again.months, r.months)
  assert.equal(again.removedTotal, 0)
  // While a pair is left the opened total shows (Save is stopped by the pair).
  assert.deepEqual(
    alterBillingOriginalTotal({ openedMonths: hema, currentMonths: hema, mbaNumber: "hema001", openedGrandTotal: 84.1 }),
    { originalGrandTotal: 84.1, doubledAsOpened: 37, rebased: false },
  )
  // Opened with no pair: the opened total, whatever the edit holds.
  assert.deepEqual(
    alterBillingOriginalTotal({ openedMonths: r.months, currentMonths: r.months, mbaNumber: "hema001", openedGrandTotal: 47.1 }),
    { originalGrandTotal: 47.1, doubledAsOpened: 0, rebased: false },
  )
})
