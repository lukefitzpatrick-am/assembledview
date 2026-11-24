/**
 * M3 (C-420): `formatMoney`'s 2-decimal display shows the cent the plan
 * stores. A float a bit under a decimal half cent (10.50 at 7%:
 * 9.764999999999999) shows $9.77, the cent `toCents` stores, on every screen
 * family. Persisted strings and whole-dollar display keep the raw float.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"
import { netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { fromCents, toCents } from "@/lib/money"
import { formatAUD, formatMoney, formatMoneyCompact } from "../money.js"

const raw2 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const raw0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 })
const EDGE = 10.5 * (1 - 7 / 100)

test("the cent-edge figure shows the stored cent, signs alike", () => {
  assert.equal(EDGE, 9.764999999999999)
  assert.equal(toCents(EDGE), 977)
  assert.equal(formatMoney(EDGE), "$9.77")
  assert.equal(formatMoney(EDGE, { decimals: 2 }), "$9.77")
  assert.equal(formatMoney(-EDGE), "-$9.77")
  assert.equal(formatMoney(9.765), "$9.77")
})

test("negative zero and a negative under half a cent show $0.00", () => {
  assert.equal(formatMoney(-0), "$0.00")
  assert.equal(formatMoney(-0.004), "$0.00")
  assert.equal(formatMoney(-0.005), "-$0.01")
})

// S10-style grid, cut to $200 so it runs in seconds: 7c budget steps by 0.25% fee steps.
function* grid(): Generator<number> {
  for (let budgetCents = 0; budgetCents <= 20_000; budgetCents += 7) {
    const budget = budgetCents / 100
    for (let quarter = 0; quarter <= 120; quarter++) {
      const pct = quarter / 4
      yield netFromGross(budget, true, pct, false)
      yield netFromGross(budget, true, pct, true)
      yield computeBurstAmounts({ rawBudget: budget, budgetIncludesFees: true, clientPaysForMedia: false, feePct: pct }).feeAmount
    }
  }
}

test("on the grid the screen shows the stored cent; persisted and whole-dollar strings keep the raw float", () => {
  let values = 0
  let moved = 0
  for (const v of grid()) {
    values++
    const shown = formatMoney(v)
    assert.equal(shown, formatAUD(fromCents(toCents(v))), `screen ${v}`)
    if (shown !== raw2.format(v)) moved++
    assert.equal(formatAUD(v), raw2.format(v), `formatAUD ${v}`)
    assert.equal(formatMoney(v, { locale: "en-AU", currency: "AUD" }), raw2.format(v), `options ${v}`)
    assert.equal(formatMoney(v, { decimals: 0 }), raw0.format(v), `whole ${v}`)
  }
  assert.ok(values > 1_000_000, String(values))
  assert.ok(moved > 0, "the grid holds cent-edge floats")
})

test("bursts_json keeps the raw float where the screen shows the stored cent", () => {
  // $0.70 at 5%, fee-inclusive: media 0.6649999999999999, fee 0.034999999999999996.
  const amounts = computeBurstAmounts({ rawBudget: 0.7, budgetIncludesFees: true, clientPaysForMedia: false, feePct: 5 })
  const [burst] = serializeBurstsJson({ bursts: [{ budget: 0.7, buyAmount: 1 }], feePct: 5, budgetIncludesFees: true, clientPaysForMedia: false })
  assert.deepEqual([burst?.mediaAmount, burst?.feeAmount], ["$0.66", "$0.03"])
  assert.deepEqual([formatMoney(amounts.deliveryMediaAmount), formatMoney(amounts.feeAmount)], ["$0.67", "$0.04"])
})

test("whole-dollar display stays one rounding from the raw value", () => {
  assert.equal(formatMoney(2.495, { decimals: 0 }), "$2")
  assert.equal(formatMoneyCompact(2.495), "$2")
})

// Screen families on the cent-edge figure.

test("billing schedule PDF follows the screen", async () => {
  const texts: string[] = []
  const doc = new Proxy(
    {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      text: (value: string) => {
        texts.push(value)
      },
      splitTextToSize: (value: string) => [value],
      output: () => new Blob([]),
    },
    { get: (obj, key) => (key in obj ? obj[key as keyof typeof obj] : () => undefined) },
  )
  const pdfMock = mock.module!("jspdf", { namedExports: { jsPDF: function FakePdf() { return doc } } })
  try {
    const { generateBillingSchedulePDF } = await import("@/lib/generateBillingSchedulePDF")
    await generateBillingSchedulePDF({
      date: "24/11/2026",
      mba_number: "M3C420",
      campaign_name: "Edge",
      campaign_brand: "Brand",
      client_name: "Client",
      billingSchedule: [{ monthYear: "March 2026", totalAmount: String(EDGE) }],
    })
  } finally {
    pdfMock.restore()
  }
  // Month and ex-GST total show the stored cent; inc-GST is addGst of the raw sum.
  assert.deepEqual(texts.filter((t) => t.startsWith("$")), ["$9.77", "$9.77", "$10.74"])
})

test("billing divergence copy, MBA workbook note, pacing line card and dashboard plan card follow the screen", async () => {
  const { summarizeBillingDivergence } = await import("@/lib/billing/compareBillingDivergence")
  const summary = summarizeBillingDivergence({
    isDivergent: true,
    divergentLines: [],
    divergentMonths: [{ monthYear: "March 2026", field: "mediaTotal", savedValue: EDGE, computedValue: 9.78, difference: 0.02 }],
  })
  assert.deepEqual(summary.monthMessages, ["March 2026 · Media total: saved $9.77, computed $9.78"])

  // MBA workbook note: moves only when a workbook is regenerated, by a cent, to the stored cent.
  const { excludedFromMbaScopeNoteFromLines } = await import("@/lib/mediaplan/excludedMbaScopeNote")
  assert.equal(
    excludedFromMbaScopeNoteFromLines([{ media: EDGE, flags: { excluded: true } }, { media: 100 }]),
    "Not in this MBA: $9.77 across 1 line (see plan for full schedule)",
  )

  const { formatRateMoney, formatWholeMoney } = await import("@/lib/pacing/channel/lineCardFormat")
  assert.equal(formatRateMoney(EDGE), "$9.77")
  assert.equal(formatWholeMoney(EDGE), "$10")

  const { buildPlanOnlyRemainderSection } = await import("@/components/dashboard/delivery/channels/planOnlyAdapter")
  const section = buildPlanOnlyRemainderSection({
    lineItems: [{ line_item_id: "m3so1", platform: "Meta", bursts: [{ budget_number: EDGE }] }],
    campaignStart: "2026-03-01",
    campaignEnd: "2026-03-31",
    lastSyncedAt: null,
  })
  assert.equal(section?.aggregate.summaryChips[0]?.value, "$9.77")
})
