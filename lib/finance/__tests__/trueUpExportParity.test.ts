/**
 * True-up parity: a trued-up billing schedule flows through to what finance
 * sends. Clients billing records (derive), the review and Send to accounts
 * CSV (one builder) and the bookkeeper workbook (one builder) all read the
 * revised months. Nothing here recomputes fees: it reads what the writer put
 * in the schedule.
 * Requires Node 22+ with `--experimental-test-module-mocks` (file-saver is CJS).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"
import type { BillingRecord } from "@/lib/types/financeBilling"

const skip = mockModuleSkip()

if (typeof mock.module === "function") {
  await mock.module("file-saver", {
    namedExports: { saveAs: () => undefined },
    defaultExport: { saveAs: () => undefined },
  })
}

const { explodeScheduleToMonthRows } = await import("@/scripts/migration/_scheduleTransform")
const { applyRevisionToBillingBlob } = await import("@/lib/finance/revisions/applyRevisionToBillingBlob")
const { planTrueUpRevision } = await import("@/lib/finance/revisions/planTrueUp")
const { buildRevisedBillingRows, diffCentsMaps, rowCentsMap } = await import("@/lib/finance/revisions/revisionWriteModel")
const { derivePlanReceivableBillingRecordsForMonth } = await import("@/lib/finance/deriveReceivableRecords")
const { buildInvoiceLinesCsv } = await import("@/lib/finance/invoiceLinesCsv")

const LABELS = ["September 2026", "October 2026", "November 2026"]

function blob() {
  const lineItems = {
    socialMedia: [
      {
        id: "TU001SM1",
        header1: "Meta",
        header2: "Awareness",
        mediaType: "socialMedia",
        billingMode: "auto",
        feeBillingMode: "auto",
        monthlyAmounts: { "September 2026": 1000, "October 2026": 1000, "November 2026": 1000 },
        feeMonthlyAmounts: { "September 2026": 250, "October 2026": 250, "November 2026": 250 },
        totalAmount: 3000,
        totalFeeAmount: 750,
      },
    ],
  }
  return LABELS.map((monthYear) => ({
    monthYear,
    lineItems: JSON.parse(JSON.stringify(lineItems)),
    mediaCosts: { socialMedia: "$1,000.00" },
    mediaTotal: "$1,000.00",
    feeTotal: "$250.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$1,250.00",
  }))
}

type Rows = Array<{ lineItemId: string; component: "media" | "fee" | "adserving"; month: string; amountCents: number; source: "computed" }>

function rowsOf(b: unknown): Rows {
  const res = explodeScheduleToMonthRows(1, "billing", b)
  assert.equal(res.failureReason, null)
  return res.rows.map((r) => ({
    lineItemId: r.lineItemId,
    component: r.component as Rows[number]["component"],
    month: String(r.month).slice(0, 10),
    amountCents: r.amountCents,
    source: "computed" as const,
  }))
}

/** September was invoiced with a $100.00 fee, not $250.00: the $150.00 spreads into Oct and Nov. */
function trueUp() {
  const rows = rowsOf(blob())
  const line = {
    lineItemId: "TU001SM1",
    label: "Meta",
    channel: "socialMedia",
    isProduction: false,
    clientPaysForMedia: false,
    isAaLine: false,
    media: {} as Record<string, number>,
    fee: {} as Record<string, number>,
    adserving: {} as Record<string, number>,
  }
  for (const r of rows) {
    const rec = r.component === "media" ? line.media : r.component === "fee" ? line.fee : line.adserving
    rec[r.month.slice(0, 7)] = (rec[r.month.slice(0, 7)] ?? 0) + r.amountCents
  }
  const plan = planTrueUpRevision({
    lines: [line],
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: ["2026-09", "2026-10", "2026-11"],
    options: { unlockApprovedMonths: [], includeProduction: false, feeMode: "keep", adservingMode: "keep" },
    request: { mode: "true_up", asOfMonth: "2026-09", strategy: "spread", components: ["fee"], actuals: { "2026-09": { fee: 10000 } } },
  })
  if (!plan.ok) assert.fail(`${plan.code}: ${plan.message}`)
  const applied = applyRevisionToBillingBlob(blob(), plan.afterCells)
  if (!applied.ok) assert.fail("blob apply failed")
  return { rows, plan, after: applied.blob }
}

function derive(schedule: unknown, month: number): BillingRecord {
  const records = derivePlanReceivableBillingRecordsForMonth(
    [
      {
        id: 30001,
        mba_number: "TU001",
        version_number: 2,
        campaign_status: "approved",
        campaign_name: "True-up parity",
        mp_client_name: "Parity Co",
        clients_id: 5,
        campaign_start_date: "2026-09-01",
        campaign_end_date: "2026-11-30",
        billingSchedule: schedule,
      },
    ],
    2026,
    month,
    new Map<string, unknown>([["Meta", { billingagency: "assembled media" }]]),
    new Map(),
    [],
    { includeNonBookedCampaigns: true },
  )
  assert.equal(records.length, 1)
  return records[0]!
}

const feeOf = (r: BillingRecord) =>
  Math.round(r.line_items.filter((l) => l.line_type !== "media").reduce((s, l) => s + Number(l.amount), 0) * 100)

test("the schedule rows the publish writes match the trued-up blob", () => {
  const { rows, plan, after } = trueUp()
  const revised = buildRevisedBillingRows(rows, plan.afterCells)
  assert.deepEqual(diffCentsMaps(rowCentsMap(rowsOf(after)), rowCentsMap(revised)), [])
})

test("Clients billing records read the trued-up months", () => {
  const { after } = trueUp()
  const sepBefore = derive(blob(), 9)
  const sep = derive(after, 9)
  const oct = derive(after, 10)
  const nov = derive(after, 11)
  assert.equal(feeOf(sepBefore), 25000)
  assert.equal(feeOf(sep), 10000)
  // The $150.00 lands in October and November; the contract fee is unchanged.
  assert.equal(feeOf(oct) + feeOf(nov), 50000 + 15000)
  assert.equal(feeOf(sep) + feeOf(oct) + feeOf(nov), 75000)
  // Record totals are the month headers and agree with the line items.
  for (const r of [sep, oct, nov]) {
    const sum = Math.round(r.line_items.reduce((s, l) => s + Number(l.amount), 0) * 100)
    assert.equal(Math.round(Number(r.total) * 100), sum)
  }
})

test("the review and Send to accounts CSV carries the trued-up amounts", () => {
  const { after } = trueUp()
  const nov = derive(after, 11)
  const before = buildInvoiceLinesCsv([derive(blob(), 11)])
  const csv = buildInvoiceLinesCsv([nov])
  assert.notEqual(csv, before)
  const money = (feeOf(nov) / 100).toFixed(2)
  assert.ok(csv.split("\n").some((l) => l.endsWith(`,${money}`)), `CSV has the November fee ${money}`)
})

test("the bookkeeper workbook (review download and Send to accounts) carries the trued-up total", { skip }, async () => {
  const { buildReceivablesWorkbookBuffer } = await import("@/lib/finance/exportFinanceHub")
  const { after } = trueUp()
  const nov = derive(after, 11)
  // The pack takes approved rows only (filterApprovedReceivablesForExport).
  const approved = { ...nov, approved_at: "2026-11-02T00:00:00Z", status: "approved", state: "approved" } as BillingRecord
  const buf = await buildReceivablesWorkbookBuffer([approved], new Map([[5, { legalBusinessName: "Parity Co Pty Ltd", abn: "1" }]]))
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const values: number[] = []
  const text: string[] = []
  wb.eachSheet((ws) =>
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        const v = cell.value as unknown
        const n = typeof v === "number" ? v : v && typeof v === "object" && "result" in v ? Number((v as { result: unknown }).result) : NaN
        if (Number.isFinite(n)) values.push(Math.round(n * 100))
        text.push(String(typeof v === "object" ? JSON.stringify(v) : v))
      }),
    ),
  )
  if (process.env.DUMP) console.log(text.join(" | "), values)
  assert.ok(values.includes(Math.round(Number(nov.total) * 100)), "workbook has the November total")
  assert.ok(values.includes(feeOf(nov)), "workbook has the November fee")
})
