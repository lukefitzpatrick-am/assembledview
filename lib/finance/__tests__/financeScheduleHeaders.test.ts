import assert from "node:assert/strict"
import { test } from "node:test"

import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"
import {
  buildProductionServiceRows,
  productionLineMonthAmounts,
} from "../financeExportProductionRows.js"
import {
  attachFinancePlanLines,
  extractFinanceExportMediaLines,
  financePlanLinesById,
  type FinancePlanLine,
} from "../financeScheduleHeaders.js"
import { extractLineItemsFromBillingSchedule, mergeFinanceLineItems } from "../utils.js"

const OCT = "October 2026"

const publisherMap = new Map<string, unknown>([
  ["Australian Community Media", { billingagency: "advertising associates" }],
  ["Hema Group Network", { billingagency: "assembled media" }],
  ["Google Ads", { billingagency: "assembled media" }],
  ["QMS", { billingagency: "advertising associates" }],
])

const planLines: FinancePlanLine[] = [
  { lineItemId: "BOSS011NP1", publisher: "Australian Community Media", platform: null, bidStrategy: null, attrs: { title: "Bendigo Advertiser" } },
  { lineItemId: "BOSS011NP2", publisher: "Australian Community Media", platform: null, bidStrategy: null, attrs: null },
  { lineItemId: "BOSS011DD1", publisher: "Hema Group Network", platform: null, bidStrategy: null, attrs: { site: "caravanworld.com.au" } },
  { lineItemId: "BOSS011SE1", publisher: null, platform: "Google Ads", bidStrategy: "Max conversions", attrs: { targeting: "Brand" } },
  { lineItemId: "BOSS011OH1", publisher: "Someone Else", platform: null, bidStrategy: null, attrs: { network: "Not QMS" } },
  { lineItemId: "BOSS011PROD1", publisher: "Australian Community Media", platform: null, bidStrategy: null, attrs: null },
]
const linesById = financePlanLinesById(planLines)

/** lineItems-shape October month: placeholder headers, one real name, production. */
function newShapeSchedule() {
  return [
    {
      monthYear: OCT,
      mediaTotal: "$7,718.00",
      feeTotal: "$1,000.20",
      adservingTechFees: "$48.00",
      production: "$500.00",
      totalAmount: "$9,266.20",
      lineItems: {
        newspaper: [
          { id: "BOSS011NP1", header1: "newspaper", header2: "BOSS011NP1", mediaType: "newspaper", billingMode: "auto", monthlyAmounts: { [OCT]: 2184 } },
          { id: "BOSS011NP2", header1: "newspaper", header2: "BOSS011NP2", mediaType: "newspaper", billingMode: "auto", monthlyAmounts: { [OCT]: 2134 } },
        ],
        digiDisplay: [
          { id: "BOSS011DD1", header1: "digiDisplay", header2: "BOSS011DD1", mediaType: "digiDisplay", billingMode: "auto", monthlyAmounts: { [OCT]: 600 } },
        ],
        search: [
          { id: "BOSS011SE1", header1: "search", header2: "BOSS011SE1", mediaType: "search", billingMode: "auto", monthlyAmounts: { [OCT]: 2400 } },
        ],
        ooh: [
          // Real name: never relabelled even though the plan line differs.
          { id: "BOSS011OH1", header1: "QMS", header2: "large_format", mediaType: "ooh", billingMode: "auto", monthlyAmounts: { [OCT]: 400 } },
        ],
        production: [
          { id: "BOSS011PROD1", header1: "production", header2: "BOSS011PROD1", mediaType: "production", billingMode: "auto", monthlyAmounts: { [OCT]: 500 } },
        ],
      },
    },
  ]
}

/** Old `mediaTypes` shape (Xano-era blob). */
function oldShapeSchedule() {
  return [
    {
      monthYear: "September 2026",
      mediaTypes: [{ mediaType: "Search", lineItems: [{ lineItemId: "x-Google Ads-1", header1: "Google Ads", header2: "brand_terms", amount: "$100.00" }] }],
      feeTotal: "$0.00",
      production: "$0.00",
      adservingTechFees: "$0.00",
    },
    {
      monthYear: OCT,
      mediaTypes: [
        { mediaType: "Newspaper", lineItems: [{ lineItemId: "BOSS011NP1", header1: "newspaper", header2: "BOSS011NP1", amount: "$2,184.00" }] },
        { mediaType: "Search", lineItems: [
          { lineItemId: "search-Google Ads-brand-1", header1: "Google Ads", header2: "brand_terms", amount: "$1,234.56" },
          { lineItemId: "search-Google Ads-brand-2", header1: "Google Ads", header2: "brand_terms", amount: "$0.00" },
        ] },
        { mediaType: "OOH", lineItems: [{ lineItemId: "ooh-QMS-1", header1: "QMS", header2: "Billboards", amount: "40000" }] },
      ],
      feeTotal: "$500.00",
      production: "$250.00",
      adservingTechFees: "$12.00",
    },
  ]
}

test("old mediaTypes shape: output is byte-identical to the old extractor, plan lines or not", () => {
  const schedule = oldShapeSchedule()
  const before = extractLineItemsFromBillingSchedule(schedule, 2026, 10, publisherMap)
  const afterNoLines = extractFinanceExportMediaLines(schedule, 2026, 10, publisherMap)
  const afterWithLines = extractFinanceExportMediaLines(schedule, 2026, 10, publisherMap, linesById)
  assert.equal(JSON.stringify(afterNoLines), JSON.stringify(before))
  assert.equal(JSON.stringify(afterWithLines), JSON.stringify(before))
  assert.equal(before.length, 3)
  // Old-shape placeholder text is not relabelled (relabel is lineItems-shape only).
  assert.equal(before[0]!.publisherName, "newspaper")
})

test("old shape: missing month and empty schedule behave as before", () => {
  assert.deepEqual(extractFinanceExportMediaLines(oldShapeSchedule(), 2026, 12, publisherMap, linesById), [])
  assert.deepEqual(extractFinanceExportMediaLines(null, 2026, 10, publisherMap, linesById), [])
  assert.deepEqual(extractFinanceExportMediaLines({ months: oldShapeSchedule() }, 2026, 10, publisherMap),
    extractLineItemsFromBillingSchedule({ months: oldShapeSchedule() }, 2026, 10, publisherMap))
})

test("lineItems shape: media rows sum to the month mediaTotal and production is not a media row", () => {
  const lines = extractFinanceExportMediaLines(newShapeSchedule(), 2026, 10, publisherMap, linesById)
  const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  assert.equal(sum, 7718)
  assert.equal(lines.some((l) => l.mediaType === "Production"), false)
  assert.equal(lines.some((l) => l.itemCode.endsWith(".Production")), false)
})

test("placeholder headers take the plan line's publisher/platform; AA codes G., Assembled codes D.", () => {
  const lines = extractFinanceExportMediaLines(newShapeSchedule(), 2026, 10, publisherMap, linesById)
  const np = lines.filter((l) => l.mediaType === "Newspaper")
  assert.equal(np.length, 2)
  for (const l of np) {
    assert.equal(l.itemCode, "G.Newspaper")
    assert.equal(l.publisherName, "Australian Community Media")
  }
  const dd = lines.find((l) => l.mediaType === "Digital Display")
  assert.equal(dd?.itemCode, "D.DigitalDisplay")
  assert.equal(dd?.publisherName, "Hema Group Network")
  const se = lines.find((l) => l.mediaType === "Search")
  assert.equal(se?.publisherName, "Google Ads")
  assert.equal(se?.itemCode, "D.Search")
})

test("a real header name is never changed", () => {
  const lines = extractFinanceExportMediaLines(newShapeSchedule(), 2026, 10, publisherMap, linesById)
  const ooh = lines.find((l) => l.mediaType === "OOH")
  assert.equal(ooh?.publisherName, "QMS")
  assert.equal(ooh?.itemCode, "G.OOH")
})

test("without plan lines, placeholders stay as they are (D. fallback, amounts unchanged)", () => {
  const lines = extractFinanceExportMediaLines(newShapeSchedule(), 2026, 10, publisherMap)
  const np = lines.find((l) => l.mediaType === "Newspaper")
  assert.equal(np?.itemCode, "D.Newspaper")
  assert.equal(np?.publisherName, "newspaper")
  assert.equal(Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, 7718)
})

test("export production: both G. and D. media present -> production rows follow the production publisher and sum to the header", () => {
  const schedule = newShapeSchedule()
  const media = mergeFinanceLineItems(
    extractFinanceExportMediaLines(schedule, 2026, 10, publisherMap, linesById),
  )
  const hasAA = media.some((l) => l.itemCode.startsWith("G."))
  const hasAM = media.some((l) => l.itemCode.startsWith("D."))
  assert.ok(hasAA && hasAM)
  const rows = buildProductionServiceRows({
    production: 500,
    hasAdvertisingAssociates: hasAA,
    hasAssembledMedia: hasAM,
    lineAmounts: productionLineMonthAmounts({
      billingSchedule: schedule,
      year: 2026,
      month: 10,
      lines: [{ lineItemId: "BOSS011PROD1", publisher: "Australian Community Media", bursts: [] }],
    }),
    billsViaAdvertisingAssociates: (name) => name === "Australian Community Media",
  })
  // All production lines bill via AA, so the full production goes under G.
  assert.deepEqual(rows, [{ itemCode: "G.Production", service: "Production", amount: 500 }])
})

test("receivables derive (Send to accounts) relabels placeholders from attached plan lines", () => {
  const version: Record<string, unknown> = {
    id: 19232,
    mba_number: "BOSS011",
    version_number: 21,
    campaign_status: "booked",
    campaign_name: "BOSS011",
    mp_client_name: "Boss",
    clients_id: 1,
    campaign_start_date: "2026-10-01",
    campaign_end_date: "2026-10-31",
    billingSchedule: newShapeSchedule(),
  }
  attachFinancePlanLines(version, planLines)
  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [version], 2026, 10, publisherMap, new Map(), [], { includeNonBookedCampaigns: true },
  )
  assert.ok(record)
  const np = record.line_items.filter((l) => l.media_type === "Newspaper")
  assert.equal(np.length, 2)
  for (const l of np) assert.equal(l.item_code, "G.Newspaper")
  const media = record.line_items.filter((l) => l.line_type === "media")
  assert.equal(Math.round(media.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100, 7718)
  assert.equal(record.line_items.find((l) => l.publisher_name === "QMS")?.item_code, "G.OOH")
})
