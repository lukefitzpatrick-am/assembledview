/**
 * One production rule for every finance output (Luke, 26 Oct 2026).
 *
 * Hub Excel (`/api/finance/data`), Send to accounts pack workbook and the
 * Clients billing review download must write the same production rows and
 * codes for the same plan month. The hub path is reproduced from the route
 * (same helpers, no I/O). The pack and review paths go through
 * `composeBillingRecordsForMonth` and `billingRecordsToFinanceCampaigns`,
 * the input `buildReceivablesWorkbookBytes` writes for both.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { billingRecordsToFinanceCampaigns } from "@/lib/finance/billingRecordToCampaignData"
import { composeBillingRecordsForMonth } from "@/lib/finance/composeFinanceHubRecords"
import { writeMediaFinanceWorksheet } from "@/lib/finance/excelFinanceExport"
import {
  productionPlanLinesFromBillingMonth,
  productionServiceRowsForMonth,
} from "@/lib/finance/financeExportProductionRows"
import { extractFinanceExportMediaLines } from "@/lib/finance/financeScheduleHeaders"
import { isProductionItemCode } from "@/lib/finance/productionItemCodes"
import {
  extractServiceAmountsFromBillingSchedule,
  mergeFinanceLineItems,
  type FinanceCampaignData,
  type FinanceServiceRow,
} from "@/lib/finance/utils"
import { buildPublisherByNameMap, type PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"
import { createBillsViaAdvertisingAssociates } from "@/lib/publisher/resolvePublisherName"

const OCT = "October 2026"

const publishers = [
  { id: 5, publisher_name: "QMS", publisherid: "QMS", billingagency: "advertising associates" },
  { id: 6, publisher_name: "Meta", publisherid: "Meta", billingagency: "assembled media" },
  { id: 12, publisher_name: "Southern Cross Austereo", publisherid: "sca", billingagency: "advertising associates" },
]

function month(over: Record<string, unknown> = {}) {
  return {
    monthYear: OCT,
    mediaTotal: "$1,500.00",
    feeTotal: "$100.00",
    adservingTechFees: "$0.00",
    production: "$500.00",
    totalAmount: "$2,100.00",
    lineItems: {
      ooh: [{ id: "PAR001OH1", header1: "QMS", header2: "large_format", mediaType: "ooh", billingMode: "auto", monthlyAmounts: { [OCT]: 1000 } }],
      socialMedia: [{ id: "PAR001SM1", header1: "Meta", header2: "Prospecting", mediaType: "socialMedia", billingMode: "auto", monthlyAmounts: { [OCT]: 500 } }],
      production: [
        // Free text "SCA" reads as Southern Cross Austereo (alias), AA.
        { id: "PAR001PROD1", header1: "SCA", header2: "Live reads", mediaType: "production", billingMode: "auto", monthlyAmounts: { [OCT]: 300 } },
        // Not in Publishers: Assembled Media.
        { id: "PAR001PROD2", header1: "Go Transit", header2: "Wrap", mediaType: "production", billingMode: "auto", monthlyAmounts: { [OCT]: 200 } },
      ],
    },
    ...over,
  }
}

function version(m: Record<string, unknown>) {
  return {
    id: 777,
    mba_number: "PAR001",
    version_number: 3,
    campaign_status: "approved",
    campaign_name: "Parity",
    mp_client_name: "Parity Client",
    clients_id: 9,
    campaign_start_date: "2026-10-01",
    campaign_end_date: "2026-10-31",
    billingSchedule: [m],
  }
}

type Row = { itemCode: string; amount: number }

function productionOnly(rows: readonly FinanceServiceRow[]): Row[] {
  return rows
    .filter((r) => isProductionItemCode(r.itemCode) && r.amount > 0)
    .map((r) => ({ itemCode: r.itemCode, amount: r.amount }))
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
}

/** `/api/finance/data` per-version production rows, same helpers as the route. */
function hubCampaign(v: ReturnType<typeof version>): FinanceCampaignData {
  const billingSchedule = v.billingSchedule
  const publisherMap = buildPublisherByNameMap(publishers as PublisherIdentityRow[])
  const media = mergeFinanceLineItems(
    extractFinanceExportMediaLines(billingSchedule, 2026, 10, publisherMap as Map<string, unknown>),
  )
  const services = extractServiceAmountsFromBillingSchedule(billingSchedule, 2026, 10)
  const serviceRows: FinanceServiceRow[] = [
    { itemCode: "T.Adserving", service: "Adserving and Tech Fees", amount: services.adservingTechFees },
    ...productionServiceRowsForMonth({
      production: services.production,
      mediaItemCodes: media.map((li) => li.itemCode),
      billingSchedule,
      year: 2026,
      month: 10,
      lines: productionPlanLinesFromBillingMonth(billingSchedule, 2026, 10),
      billsViaAdvertisingAssociates: createBillsViaAdvertisingAssociates(publishers),
    }),
    { itemCode: "Service", service: "Assembled Fee", amount: services.assembledFee },
  ]
  return {
    clientName: v.mp_client_name,
    mbaNumber: v.mba_number,
    poNumber: "",
    campaignName: v.campaign_name,
    paymentDays: 30,
    paymentTerms: "Net 30 days",
    invoiceDate: "2026-10-31",
    lineItems: media,
    serviceRows,
    total: 0,
  } as unknown as FinanceCampaignData
}

function composed(v: ReturnType<typeof version>) {
  return composeBillingRecordsForMonth({
    monthStr: "2026-10",
    relevantVersions: [v as unknown as Record<string, unknown>],
    clients: [],
    publishers: publishers as unknown as Record<string, unknown>[],
    scopes: null,
    persistedStatusRows: [],
    includeNonBooked: true,
    types: ["media"],
    clientsIdParam: null,
    searchParam: null,
    statusParam: null,
    publishersIdParam: null,
  })
}

async function productionCells(campaigns: FinanceCampaignData[]): Promise<string[]> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await writeMediaFinanceWorksheet(wb, "Media", campaigns)
  const out: string[] = []
  wb.getWorksheet("Media")!.eachRow((row) => {
    const cells = (row.values as unknown[]).map((v) => (v == null ? "" : String(v)))
    if (cells.some((c) => /^[GD]\.Production$|^Production$/.test(c.trim()))) {
      out.push(cells.filter((c) => c !== "").join("|"))
    }
  })
  return out.sort()
}

function allThree(v: ReturnType<typeof version>) {
  const hub = hubCampaign(v)
  const records = composed(v)
  assert.equal(records.length, 1)
  const pack = billingRecordsToFinanceCampaigns(records, new Map())
  const review = billingRecordsToFinanceCampaigns(records, new Map(), { statusLabel: () => "Ready" })
  assert.equal(pack.length, 1)
  assert.equal(review.length, 1)
  return { hub, pack: pack[0]!, review: review[0]!, record: records[0]! }
}

test("both codes: hub Excel, pack and review give the same split production rows", () => {
  const { hub, pack, review, record } = allThree(version(month()))
  const expected: Row[] = [
    { itemCode: "D.Production", amount: 200 },
    { itemCode: "G.Production", amount: 300 },
  ]
  assert.deepEqual(productionOnly(hub.serviceRows), expected)
  assert.deepEqual(productionOnly(pack.serviceRows), expected)
  assert.deepEqual(productionOnly(review.serviceRows), expected)

  // Production is counted once: rows sum to the month header, record total unchanged.
  const prod = record.line_items.filter((l) => isProductionItemCode(l.item_code))
  assert.equal(prod.reduce((s, l) => s + l.amount, 0), 500)
  assert.ok(prod.every((l) => l.line_type === "service" && l.production_split === true))
  assert.equal(record.line_items.some((l) => l.line_type === "media" && /production/i.test(l.media_type ?? "")), false)
  const sum = Math.round(record.line_items.reduce((s, l) => s + l.amount, 0) * 100) / 100
  assert.equal(sum, 2100)
  assert.equal(record.total, 2100)
})

test("both codes: the three workbooks write the same production cells", { timeout: 600_000 }, async () => {
  const { hub, pack, review } = allThree(version(month()))
  const [hubCells, packCells, reviewCells] = await Promise.all([
    productionCells([hub]),
    productionCells([pack]),
    productionCells([review]),
  ])
  assert.equal(hubCells.length, 2)
  assert.deepEqual(packCells, hubCells)
  assert.deepEqual(reviewCells, hubCells)
})

test("one code only: the full production under that code in all three", () => {
  const m = month({
    mediaTotal: "$1,000.00",
    totalAmount: "$1,600.00",
    lineItems: { ...month().lineItems, socialMedia: [] },
  })
  const { hub, pack, review } = allThree(version(m))
  const expected: Row[] = [{ itemCode: "G.Production", amount: 500 }]
  assert.deepEqual(productionOnly(hub.serviceRows), expected)
  assert.deepEqual(productionOnly(pack.serviceRows), expected)
  assert.deepEqual(productionOnly(review.serviceRows), expected)
})

test("production-only month: split by production publisher in all three", () => {
  const m = month({
    mediaTotal: "$0.00",
    totalAmount: "$600.00",
    lineItems: { production: month().lineItems.production },
  })
  const { hub, pack, review, record } = allThree(version(m))
  const expected: Row[] = [
    { itemCode: "D.Production", amount: 200 },
    { itemCode: "G.Production", amount: 300 },
  ]
  assert.deepEqual(productionOnly(hub.serviceRows), expected)
  assert.deepEqual(productionOnly(pack.serviceRows), expected)
  assert.deepEqual(productionOnly(review.serviceRows), expected)
  assert.equal(record.total, 600)
})
