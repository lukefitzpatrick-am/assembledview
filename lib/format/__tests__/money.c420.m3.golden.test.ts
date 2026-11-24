/**
 * M3 goldens (C-420): what must not move when `formatMoney`'s 2-decimal
 * display path rounds through the house `roundMoney2` first.
 * - Persisted strings: `formatAUD` (stored billing schedule strings),
 *   `formatMoney` with locale or fraction options and `serializeBurstsJson`
 *   (`bursts_json`), and the stored schedule strings `computeCampaignFinancials`
 *   writes for the cent-edge line (10.50 at 7%, fee-inclusive).
 * - Whole-dollar display (`decimals: 0`, `formatMoneyCompact` under $1,000):
 *   $2.495 shows $2, never $3 (no double rounding).
 * - String input, zero, NaN and the "—" sentinel.
 * - 2-decimal display of values not on a float half cent, and each screen
 *   family on such values: billing schedule PDF, finance tile and billing
 *   divergence copy, pacing line card, dashboard plan card.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"
import { formatAUD, formatMoney, formatMoneyCompact } from "../money.js"

// Cent-edge sample from the M1 and M2 fixtures. Only the first is a float a
// bit under a decimal half cent; the rest sit on or near an edge and must
// show the same on every path.
const EDGE = [
  10.5 * (1 - 7 / 100), // 10.50 at 7%: 9.764999999999999
  1050 * (1 - 7 / 100), // 976.4999999999999, the M2 count edge
  0.7 * (1 - 19.5 / 100), // 0.70 at 19.5%
  1.005,
  4.015,
  8.345,
]

test("formatAUD keeps the raw float: stored billing strings do not move", () => {
  assert.deepEqual(EDGE.map(formatAUD), ["$9.76", "$976.50", "$0.56", "$1.01", "$4.02", "$8.35"])
  assert.deepEqual(EDGE.map((v) => formatAUD(-v)), ["-$9.76", "-$976.50", "-$0.56", "-$1.01", "-$4.02", "-$8.35"])
  assert.equal(formatAUD(0), "$0.00")
  assert.equal(formatAUD(Number.NaN), "$0.00")
  assert.equal(formatAUD(null), "$0.00")
})

test("formatMoney with locale or fraction options keeps the raw float (bursts_json)", () => {
  const opts = { locale: "en-AU", currency: "AUD" }
  assert.deepEqual(EDGE.map((v) => formatMoney(v, opts)), ["$9.76", "$976.50", "$0.56", "$1.01", "$4.02", "$8.35"])
  assert.equal(formatMoney(9.764999999999999, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "$9.76")
  assert.equal(formatMoney(Number.NaN, opts), "")
  const bursts = serializeBurstsJson({
    bursts: [{ budget: 10.5, buyAmount: 9.764999999999999, startDate: "2026-03-01", endDate: "2026-03-31", calculatedValue: 976 }],
    feePct: 7,
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    buyType: "cpm",
  })
  assert.deepEqual(bursts, [
    {
      budget: "$10.50",
      buyAmount: "$9.76",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      calculatedValue: 976,
      mediaAmount: "$9.77",
      feeAmount: "$0.74",
      adServingRatePct: undefined,
      adServingImpressions: undefined,
    },
  ])
})

test("string input keeps the legacy path", () => {
  assert.equal(formatMoney("9.764999999999999"), "$9.76")
  assert.equal(formatMoney("$1,234.565"), "$1,234.57")
  assert.equal(formatMoney("not money"), "")
})

test("whole-dollar display never rounds to cents first", () => {
  assert.equal(formatMoney(2.495, { decimals: 0 }), "$2")
  assert.equal(formatMoney(-2.495, { decimals: 0 }), "-$2")
  assert.equal(formatMoney(2.5, { decimals: 0 }), "$3")
  assert.equal(formatMoney(9.764999999999999, { decimals: 0 }), "$10")
  assert.equal(formatMoneyCompact(2.495), "$2")
  assert.equal(formatMoneyCompact(999.495), "$999")
  assert.equal(formatMoneyCompact(43_049.5), "$43.0K")
})

test("zero, NaN, null and Infinity", () => {
  assert.equal(formatMoney(0), "$0.00")
  assert.equal(formatMoney(Number.NaN), "—")
  assert.equal(formatMoney(null), "—")
  assert.equal(formatMoney(undefined), "—")
  assert.equal(formatMoney(Number.POSITIVE_INFINITY), "—")
  assert.equal(formatMoney(Number.NaN, { decimals: 0 }), "—")
  assert.equal(formatMoneyCompact(Number.NaN), "—")
})

test("2-decimal display of values off a float half cent", () => {
  const values = [0.1 + 0.2, 1234.5, -1234.567, 0.005, -0.005, 2.495, 976.5, 1e9 + 0.25, 12.344999]
  assert.deepEqual(values.map((v) => formatMoney(v)), [
    "$0.30",
    "$1,234.50",
    "-$1,234.57",
    "$0.01",
    "-$0.01",
    "$2.50",
    "$976.50",
    "$1,000,000,000.25",
    "$12.34",
  ])
  assert.deepEqual(values.map((v) => formatMoney(v, { decimals: 2 })), values.map((v) => formatMoney(v)))
})

test("stored schedule strings for the cent-edge line do not move", () => {
  const financials = computeCampaignFinancials(
    [
      {
        lineItemId: "M3C420DD001",
        mediaType: "digiDisplay",
        buyType: "cpm",
        rate: 10,
        enteredAmount: 10.5,
        budgetIncludesFees: true,
        clientPaysForMedia: false,
        noAdserving: true,
        feePct: 7,
        bursts: [{ startDate: "2026-03-01", endDate: "2026-03-31", budget: 10.5, buyAmount: 10 }],
        approval: "approved",
      },
    ],
    { feeLoading: { feedigidisplay: 7 } },
    { oneNetMedia: false },
  )
  const month = financials.billingSchedule[0]!
  assert.deepEqual([month.monthYear, month.mediaTotal, month.feeTotal, month.totalAmount], [
    "March 2026",
    "$9.77",
    "$0.74",
    "$10.51",
  ])
})

// Screen families, on values off a half cent.

test("billing schedule PDF amounts", async () => {
  const texts: string[] = []
  class FakePdf {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }
    text(value: string | string[]) {
      texts.push(...(Array.isArray(value) ? value : [value]))
      return this
    }
    splitTextToSize(value: string) {
      return [value]
    }
    output() {
      return new Blob([])
    }
  }
  const fake = new Proxy(FakePdf, {
    construct(target) {
      return new Proxy(new target(), {
        get(obj, key) {
          return key in obj ? obj[key as keyof FakePdf] : () => obj
        },
      })
    },
  })
  const pdfMock = mock.module!("jspdf", { namedExports: { jsPDF: fake } })
  try {
    const { generateBillingSchedulePDF } = await import("@/lib/generateBillingSchedulePDF")
    await generateBillingSchedulePDF({
      date: "24/11/2026",
      mba_number: "M3C420",
      campaign_name: "Goldens",
      campaign_brand: "Brand",
      client_name: "Client",
      billingSchedule: [
        { monthYear: "March 2026", totalAmount: "$1,234.50" },
        {
          monthYear: "April 2026",
          mediaTypes: [{ mediaType: "Search", lineItems: [{ header1: "Google", header2: "Brand", amount: "$100.10" }] }],
          feeTotal: "$10.20",
          adservingTechFees: "$0.30",
        },
      ],
    })
  } finally {
    pdfMock.restore()
  }
  const money = texts.filter((t) => t.startsWith("$") || t.startsWith("-$"))
  assert.deepEqual(money, ["$1,234.50", "$110.60", "$100.10", "$1,345.10", "$1,479.61"])
})

test("finance tile and billing divergence copy", async () => {
  const { StatTile } = await import("@/components/finance/sections/StatTile")
  const html = renderToStaticMarkup(
    createElement(StatTile, { label: "Owed", basisCaption: "All clients", state: { status: "ready", cents: 123_456 } }),
  )
  assert.ok(html.includes("$1,234.56"), html)
  const { summarizeBillingDivergence } = await import("@/lib/billing/compareBillingDivergence")
  const summary = summarizeBillingDivergence({
    isDivergent: true,
    divergentLines: [],
    divergentMonths: [{ monthYear: "March 2026", field: "mediaTotal", savedValue: 100.1, computedValue: 100.2, difference: 0.1 }],
  })
  assert.deepEqual(summary.monthMessages, ["March 2026 · Media total: saved $100.10, computed $100.20"])
})

test("pacing line card money", async () => {
  const { formatRateMoney, formatWholeMoney } = await import("@/lib/pacing/channel/lineCardFormat")
  assert.equal(formatRateMoney(12.5), "$12.50")
  assert.equal(formatRateMoney(0.1 + 0.2), "$0.30")
  assert.equal(formatWholeMoney(2.495), "$2")
  assert.equal(formatRateMoney(Number.NaN), "—")
})

test("dashboard plan card", async () => {
  const { buildPlanOnlyRemainderSection } = await import("@/components/dashboard/delivery/channels/planOnlyAdapter")
  const section = buildPlanOnlyRemainderSection({
    lineItems: [{ line_item_id: "m3so1", platform: "Meta", bursts: [{ budget_number: 1000.1 }, { budget_number: 234.2 }] }],
    campaignStart: "2026-03-01",
    campaignEnd: "2026-03-31",
    lastSyncedAt: null,
  })
  assert.equal(section?.aggregate.summaryChips[0]?.value, "$1,234.30")
})
