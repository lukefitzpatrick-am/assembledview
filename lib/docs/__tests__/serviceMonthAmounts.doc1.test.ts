/**
 * DOC-1 (Luke, 28 Oct 2026): media plan Excel Service Fee and Ad Serving month
 * cells read the version's BILLING schedule (schedule_months, basis billing,
 * components fee and adserving) to the cent. Totals stay as before.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { placeMonthAmountsOnSheet } from "@/lib/docs/allocateLineAcrossMonths"
import {
  serviceMonthAmountsFromBillingRows,
  type BillingScheduleServiceRow,
} from "@/lib/docs/workbookServiceMonthWeights"
import { addGst } from "@/lib/finance/gst"
import {
  generateMediaPlan,
  type LineItem,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import { fromCents, sumCents, toCents } from "@/lib/money"

/** golf025 v39 (version 19590) billing-basis fee and adserving, Supabase SELECT 28 Oct 2026. */
const GOLF025_V39_FEE: Array<[string, number]> = [
  ["2026-04-01", 100000], ["2026-05-01", 100000], ["2026-06-01", 100000], ["2026-07-01", 100000],
  ["2026-08-01", 226975], ["2026-09-01", 240541], ["2026-10-01", 351234], ["2026-11-01", 346592],
  ["2026-12-01", 34658],
]
const GOLF025_V39_ADSERVING: Array<[string, number]> = [
  ["2026-08-01", 42], ["2026-09-01", 623], ["2026-10-01", 14930], ["2026-11-01", 30280], ["2026-12-01", 3123],
]

function golf025Rows(): BillingScheduleServiceRow[] {
  // Spread over two lines (one decorated) to prove the per-month sum.
  const rows: BillingScheduleServiceRow[] = []
  for (const [month, cents] of GOLF025_V39_FEE) {
    const a = Math.floor(cents / 3)
    rows.push({ lineItemId: "golf025SM1", component: "fee", month, amountCents: a })
    rows.push({ lineItemId: "billing-progVideo::golf025PV1", component: "fee", month, amountCents: cents - a })
  }
  for (const [month, cents] of GOLF025_V39_ADSERVING) {
    rows.push({ lineItemId: "golf025PV1", component: "adserving", month, amountCents: cents })
  }
  return rows
}

const GOLF025_FEE_EXPECTED: Record<string, number> = {
  "April 2026": 1000, "May 2026": 1000, "June 2026": 1000, "July 2026": 1000,
  "August 2026": 2269.75, "September 2026": 2405.41, "October 2026": 3512.34,
  "November 2026": 3465.92, "December 2026": 346.58,
}
const GOLF025_ADSERVING_EXPECTED: Record<string, number> = {
  "August 2026": 0.42, "September 2026": 6.23, "October 2026": 149.3,
  "November 2026": 302.8, "December 2026": 31.23,
}

test("billing rows give exact month amounts per component (golf025 v39)", () => {
  const out = serviceMonthAmountsFromBillingRows({ rows: golf025Rows(), includeLine: () => true })
  assert.deepEqual(out.fee, GOLF025_FEE_EXPECTED)
  assert.deepEqual(out.adServing, GOLF025_ADSERVING_EXPECTED)
  assert.equal(sumCents(Object.values(out.fee!).map(toCents)), 1_600_000)
  assert.equal(sumCents(Object.values(out.adServing!).map(toCents)), 48_998)
})

test("excluded lines and out-of-scope months are left out; __service__ rows stay; empty components omitted", () => {
  const rows: BillingScheduleServiceRow[] = [
    { lineItemId: "a1", component: "fee", month: "2026-01-01", amountCents: 1_000 },
    { lineItemId: "billing-search::x9", component: "fee", month: "2026-01-01", amountCents: 5_000 },
    { lineItemId: "__service__fees", component: "fee", month: "2026-02-01", amountCents: 250 },
    { lineItemId: "a1", component: "fee", month: "2026-03-01", amountCents: 700 },
    { lineItemId: "a1", component: "media", month: "2026-01-01", amountCents: 99_999 },
  ]
  const out = serviceMonthAmountsFromBillingRows({
    rows,
    includeLine: (id) => id !== "x9",
    selectedMonthYears: ["January 2026", "February 2026"],
  })
  assert.deepEqual(out, { fee: { "January 2026": 10, "February 2026": 2.5 } })
  assert.deepEqual(serviceMonthAmountsFromBillingRows({ rows: [], includeLine: () => true }), {})
})

test("sheet placement: on-sheet months exact, off-sheet months fold to the nearest edge", () => {
  const keys = ["January 2026", "February 2026", "March 2026"]
  assert.deepEqual(
    placeMonthAmountsOnSheet({ amounts: { "February 2026": 10.01, "March 2026": 0.02 }, monthKeys: keys }),
    { "January 2026": 0, "February 2026": 10.01, "March 2026": 0.02 },
  )
  assert.deepEqual(
    placeMonthAmountsOnSheet({
      amounts: { "November 2025": 1.1, "January 2026": 2.2, "May 2026": 3.3 },
      monthKeys: keys,
    }),
    { "January 2026": 3.3, "February 2026": 0, "March 2026": 3.3 },
  )
})

const HEADER: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Test Client",
  brand: "Test Brand",
  campaignName: "DOC-1",
  mbaNumber: "MBA0001",
  clientContact: "Jane",
  planVersion: "1",
  poNumber: "PO1",
  campaignBudget: "100000",
  campaignStatus: "Approved",
  campaignStart: "09/04/2026",
  campaignEnd: "06/12/2026",
}

function emptyMedia(overrides: Partial<MediaItems> = {}): MediaItems {
  return {
    search: [], socialMedia: [], digiAudio: [], digiDisplay: [], digiVideo: [], bvod: [],
    progDisplay: [], progVideo: [], progBvod: [], progOoh: [], progAudio: [], newspaper: [],
    magazines: [], television: [], radio: [], ooh: [], cinema: [], integration: [],
    influencers: [], production: [],
    ...overrides,
  }
}

function searchLine(overrides: Partial<LineItem>): LineItem {
  return {
    market: "National", platform: "Google", bidStrategy: "maximize_clicks", targeting: "Brand",
    creative: "RSA", buyingDemo: "All", buyType: "cpc", startDate: "2026-04-09", endDate: "2026-12-06",
    deliverables: 1000, deliverablesAmount: "100000", grossMedia: "100000",
    ...overrides,
  }
}

function rowMonthValues(sheet: import("exceljs").Worksheet, label: string): Record<string, number> {
  let headerRow = 0
  let target = 0
  sheet.eachRow((row, rowNumber) => {
    if (String(row.getCell(2).value ?? "") === label) target = rowNumber
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!headerRow && /^[A-Z][a-z]+ 20\d\d/.test(String(cell.value))) headerRow = rowNumber
    })
  })
  assert.ok(target > 0, label)
  assert.ok(headerRow > 0, "month header row")
  const out: Record<string, number> = {}
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const month = String(cell.value ?? "").split("\n")[0]!
    if (!/ 20\d\d$/.test(month) || month in out) return
    const value = sheet.getRow(target).getCell(col).value
    out[month] = typeof value === "number" ? value : 0
  })
  return out
}

function rowTotal(sheet: import("exceljs").Worksheet, label: string): unknown {
  let value: unknown = null
  sheet.eachRow((row) => {
    if (String(row.getCell(2).value ?? "") === label) value = row.getCell(14).value
  })
  return value
}

function nonZero(rec: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== 0))
}

test("workbook: golf025 v39 billing months land on the Service Fee and Ad Serving rows to the cent", async () => {
  const amounts = serviceMonthAmountsFromBillingRows({ rows: golf025Rows(), includeLine: () => true })
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({ search: [searchLine({})] }),
    {
      gross_media: [{ media_type: "Search", gross_amount: 100000 }],
      totals: {
        gross_media: 100000,
        service_fee: 16000,
        production: 0,
        adserving: 489.98,
        totals_ex_gst: 116489.98,
        total_inc_gst: addGst(116489.98),
      },
    },
    {
      // Delivery weights that disagree, to prove the billing amounts win.
      serviceMonthWeights: { fee: { "December 2026": 1 }, adServing: { "April 2026": 1 } },
      serviceMonthAmounts: amounts,
    },
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  assert.deepEqual(nonZero(rowMonthValues(sheet, "Service Fee")), GOLF025_FEE_EXPECTED)
  assert.deepEqual(nonZero(rowMonthValues(sheet, "Ad Serving & Tech")), GOLF025_ADSERVING_EXPECTED)
  // Totals stay as they were (mbaData).
  assert.equal(rowTotal(sheet, "Service Fee"), 16000)
  assert.equal(rowTotal(sheet, "Ad Serving & Tech"), 489.98)
})

test("workbook: a prebill puts the fee in the billing month, not the delivery month", async () => {
  // Campaign Jan to Feb, the only line delivers in February; finance bills the
  // whole fee in January (prebill). Delivery weights would put it in February.
  const header = { ...HEADER, campaignStart: "05/01/2026", campaignEnd: "28/02/2026" }
  const amounts = serviceMonthAmountsFromBillingRows({
    rows: [
      { lineItemId: "s1", component: "fee", month: "2026-01-01", amountCents: 150_000 },
      { lineItemId: "s1", component: "adserving", month: "2026-02-01", amountCents: 1_234 },
    ],
    includeLine: () => true,
  })
  const workbook = await generateMediaPlan(
    header,
    emptyMedia({ search: [searchLine({ startDate: "2026-02-01", endDate: "2026-02-28", grossMedia: "10000", deliverablesAmount: "10000" })] }),
    {
      gross_media: [{ media_type: "Search", gross_amount: 10000 }],
      totals: {
        gross_media: 10000,
        service_fee: 1500,
        production: 0,
        adserving: 12.34,
        totals_ex_gst: 11512.34,
        total_inc_gst: addGst(11512.34),
      },
    },
    {
      serviceMonthWeights: { fee: { "February 2026": 1500 }, adServing: { "February 2026": 12.34 } },
      serviceMonthAmounts: amounts,
    },
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  const fee = rowMonthValues(sheet, "Service Fee")
  assert.equal(fee["January 2026"], 1500)
  assert.equal(fee["February 2026"], 0)
  assert.equal(fromCents(sumCents(Object.values(fee).map(toCents))), 1500)
  assert.equal(rowMonthValues(sheet, "Ad Serving & Tech")["February 2026"], 12.34)
})
