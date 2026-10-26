/**
 * FB-2 invoice line descriptors and grouping. Fixtures are shaped on live
 * published plan lines (discovery Q4 examples, 27 Oct 2026).
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { groupInvoiceMediaRows, sumInvoiceLineRowsCents } from "@/lib/finance/groupInvoiceMediaRows"
import { humaniseDescriptorValue, invoiceDescriptor } from "@/lib/finance/invoiceDescriptor"
import { financeMediaLinesFromBillingMonth } from "@/lib/finance/scheduleMonthFinanceExtract"
import type { FinanceLineItem } from "@/lib/finance/utils"

const OCT = "October 2026"

type PlanLine = {
  lineItemId: string
  mediaKey: string
  publisher?: string | null
  platform?: string | null
  bidStrategy?: string | null
  attrs?: Record<string, unknown>
}

const FIXTURES: Array<{ line: PlanLine; label: string }> = [
  {
    line: {
      lineItemId: "TheY001OH25",
      mediaKey: "ooh",
      publisher: null,
      attrs: { network: "QMS", format: "large_format", type: "Digital Large Format", placement: "Warringah Freeway (M1 Mwy)" },
    },
    label: "QMS - Large format",
  },
  {
    line: {
      lineItemId: "pgaaus017NP1",
      mediaKey: "newspaper",
      publisher: "News Corp",
      attrs: { network: "News Corp ", title: "Daily Telegraph", size: "Medium Strip" },
    },
    label: "News Corp - Daily Telegraph",
  },
  {
    line: { lineItemId: "TRWICO001MG1", mediaKey: "magazines", publisher: null, attrs: { network: "Cartology", title: "Fresh Ideas" } },
    label: "Cartology - Fresh Ideas",
  },
  {
    line: { lineItemId: "TheY001SE1", mediaKey: "search", platform: "ChatGPT", bidStrategy: "manual_cpc", attrs: { targeting: "long free text" } },
    label: "ChatGPT - Manual cpc",
  },
  {
    line: { lineItemId: "bicau009SM1", mediaKey: "socialMedia", platform: "Meta", bidStrategy: "reach", attrs: {} },
    label: "Meta - Reach",
  },
  {
    line: {
      lineItemId: "pgaaus017RA1",
      mediaKey: "radio",
      platform: "SEN",
      attrs: { network: "Sports Entertainment Network", station: "Run of Network", format: "Product Credit Host Read" },
    },
    label: "Sports Entertainment Network - Run of Network",
  },
  {
    line: {
      lineItemId: "penfold025TV1",
      mediaKey: "television",
      attrs: { network: "Foxtel Media ", station: "", placement: "Formula One Content Squeezebacks" },
    },
    label: "Foxtel Media - Formula One Content Squeezebacks",
  },
  {
    line: { lineItemId: "TheY001DD1", mediaKey: "digiDisplay", publisher: "Quantcast", attrs: { network: "Ignored", site: "Whitelist" } },
    label: "Quantcast - Whitelist",
  },
]

test("descriptor per media type follows the confirmed table", () => {
  for (const { line, label } of FIXTURES) {
    const d = invoiceDescriptor({ mediaKey: line.mediaKey, publisher: line.publisher, platform: line.platform, bidStrategy: line.bidStrategy, attrs: line.attrs })
    assert.equal(d?.label, label, line.lineItemId)
  }
})

test("fallbacks: press publisher, radio platform, cinema format, influencers campaign, production none", () => {
  assert.equal(invoiceDescriptor({ mediaKey: "newspaper", publisher: "Are Media", attrs: { title: "Herald" } })?.label, "Are Media - Herald")
  assert.equal(invoiceDescriptor({ mediaKey: "radio", platform: "ARN", attrs: { station: "KIIS" } })?.label, "ARN - KIIS")
  assert.equal(invoiceDescriptor({ mediaKey: "cinema", attrs: { network: "Val Morgan", station: "", format: "Gold Class" } })?.label, "Val Morgan - Gold Class")
  assert.equal(invoiceDescriptor({ mediaKey: "cinema", attrs: { network: "MIFF", station: "Hoyts", format: "x" } })?.label, "MIFF - Hoyts")
  assert.equal(invoiceDescriptor({ mediaKey: "influencers", platform: "TikTok", attrs: { campaign: "Summer" } })?.label, "TikTok - Summer")
  assert.equal(invoiceDescriptor({ mediaKey: "integration", platform: "Nova", bidStrategy: "fixed_fee" })?.label, "Nova - Fixed fee")
  assert.equal(invoiceDescriptor({ mediaKey: "production", publisher: "TikTok" }), null)
  assert.equal(invoiceDescriptor({ mediaKey: "search", platform: "Google Ads", bidStrategy: "" })?.label, "Google Ads")
})

test("humaniser touches keys only, never names", () => {
  assert.equal(humaniseDescriptorValue("maximize_conversions"), "Maximize conversions")
  assert.equal(humaniseDescriptorValue("TVB APP"), "TVB APP")
  assert.equal(humaniseDescriptorValue("reach"), "reach")
  assert.equal(humaniseDescriptorValue("reach", true), "Reach")
  assert.equal(humaniseDescriptorValue("Digital Large Format", true), "Digital Large Format")
})

function scheduleMonth(rows: Array<{ mediaKey: string; id: string; header1: string; header2: string; amount: number }>): BillingMonth {
  const lineItems: Record<string, unknown[]> = {}
  for (const r of rows) {
    ;(lineItems[r.mediaKey] ??= []).push({
      id: r.id,
      header1: r.header1,
      header2: r.header2,
      monthlyAmounts: { [OCT]: r.amount },
    })
  }
  return { monthYear: OCT, lineItems } as unknown as BillingMonth
}

function linesById(lines: PlanLine[]): Record<string, unknown> {
  return Object.fromEntries(lines.map((l) => [l.lineItemId, { ...l, bid_strategy: l.bidStrategy ?? null }]))
}

const publisherMap = new Map<string, { billingagency?: string | null }>([
  ["QMS", { billingagency: "advertising associates" }],
  ["News Corp", { billingagency: "advertising associates" }],
])

test("shared path: descriptor from the plan line, old header text without it", () => {
  const plan = FIXTURES.map((f) => f.line)
  const month = scheduleMonth(
    plan.map((l, i) => ({ mediaKey: l.mediaKey, id: l.lineItemId, header1: "hdr", header2: "two", amount: 100 + i }))
  )
  const withPlan = financeMediaLinesFromBillingMonth(month, publisherMap, linesById(plan))
  assert.deepEqual(
    withPlan.map((l) => l.description),
    FIXTURES.map((f) => f.label)
  )
  const without = financeMediaLinesFromBillingMonth(month, publisherMap)
  assert.ok(without.every((l) => l.description !== "" && l.detail == null))
})

test("grouping: identical supplier + detail summed, supplier order, subtotals, total to the cent", () => {
  const plan: PlanLine[] = [
    { lineItemId: "TheY001OH25", mediaKey: "ooh", attrs: { network: "QMS", format: "large_format" } },
    { lineItemId: "TheY001OH26", mediaKey: "ooh", attrs: { network: "QMS", format: "large_format" } },
    { lineItemId: "TheY001OH27", mediaKey: "ooh", attrs: { network: "QMS", format: "street_furniture" } },
    { lineItemId: "TheY001OH28", mediaKey: "ooh", attrs: { network: "JCDecaux", format: "large_format" } },
    { lineItemId: "TheY001SE1", mediaKey: "search", platform: "Google Ads", bidStrategy: "maximize_conversions" },
    { lineItemId: "TheY001SE2", mediaKey: "search", platform: "Google Ads", bidStrategy: "maximize_conversions" },
    { lineItemId: "TheY001DD1", mediaKey: "digiDisplay", publisher: "Quantcast", attrs: { site: "Whitelist" } },
  ]
  const amounts = [1000.1, 2000.2, 333.33, 450.07, 0.1, 0.2, 99.99]
  const month = scheduleMonth(plan.map((l, i) => ({ mediaKey: l.mediaKey, id: l.lineItemId, header1: "h", header2: "x", amount: amounts[i]! })))
  const lines = financeMediaLinesFromBillingMonth(month, publisherMap, linesById(plan))
  const rows = groupInvoiceMediaRows(lines)
  assert.deepEqual(
    rows.map((r) => [r.rowType, r.description, r.amountCents]),
    [
      ["line", "Google Ads - Maximize conversions", 30],
      ["line", "JCDecaux - Large format", 45007],
      ["line", "QMS - Large format", 300030],
      ["line", "QMS - Street furniture", 33333],
      ["subtotal", "QMS subtotal", 333363],
      ["line", "Quantcast - Whitelist", 9999],
    ]
  )
  assert.equal(rows[4]!.itemCode, "")
  assert.deepEqual(rows.find((r) => r.description === "QMS - Large format")!.planLineItemIds, ["TheY001OH25", "TheY001OH26"])
  const oldCents = lines.reduce((s, l) => s + Math.round(l.amount * 100), 0)
  assert.equal(sumInvoiceLineRowsCents(rows), oldCents)
})

test("block total unchanged for every fixture media type", () => {
  const plan = FIXTURES.map((f) => f.line)
  const month = scheduleMonth(plan.flatMap((l, i) => [
    { mediaKey: l.mediaKey, id: l.lineItemId, header1: "h", header2: "x", amount: 123.45 + i },
    { mediaKey: l.mediaKey, id: `${l.lineItemId}b`, header1: "h", header2: "x", amount: 0.55 },
  ]))
  const byId = linesById([...plan, ...plan.map((l) => ({ ...l, lineItemId: `${l.lineItemId}b` }))])
  const lines: FinanceLineItem[] = financeMediaLinesFromBillingMonth(month, publisherMap, byId)
  const rows = groupInvoiceMediaRows(lines)
  assert.equal(rows.filter((r) => r.rowType === "line").length, FIXTURES.length)
  assert.equal(sumInvoiceLineRowsCents(rows), lines.reduce((s, l) => s + Math.round(l.amount * 100), 0))
  assert.equal(rows.filter((r) => r.rowType === "subtotal").length, 0)
})
