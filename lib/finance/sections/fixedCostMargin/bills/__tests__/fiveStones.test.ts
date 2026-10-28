/**
 * MAR-10: Five Stones DV360 bills beside DV360 AMOUNT_SPENT. Parsing, MBA-month
 * matching, the split over the MBA's DV360 lines, the gap, and the Excel sheet.
 * Amounts are the live hartm001 Aug 2026 figures, names anonymised.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDv360CheckRows,
  composeFixedCostMargin,
  fiveStonesShareCents,
  summariseFixedCostMargin,
  type FixedCostPlanCell,
  type PlatformSpendCell,
} from "../../compose.js"
import { buildFixedCostMarginWorkbookBytes } from "../../excel.js"
import {
  dv360BillCells,
  dv360CheckCells,
  dv360Gap,
  dv360SpendByMbaMonth,
  isDv360Bill,
  isFiveStonesContact,
  mbaOfLineId,
  parseFiveStonesDv360Bill,
  unmatchedDv360Lines,
} from "../fiveStones.js"
import type { RawBillRow } from "../parse.js"

const KNOWN = new Set(["krusty001", "krusty005", "krusty0011"])

/** Shape of Five Stones 12034755 (DV360, Aug 2026, Exclusive). */
const FS_DV360_AUG: RawBillRow = {
  billId: 7064,
  xeroInvoiceId: "fs-dv-aug",
  invoiceNumber: "12034755",
  referenceRaw: "",
  contactName: "Five Stones",
  status: "PAID",
  currency: "AUD",
  issueDate: "2026-08-31",
  lineAmountTypes: "Exclusive",
  lineItems: [
    { Description: "Display & Video 360 12033094\n\n2026.8.1 to 2026.8.31", LineAmount: null },
    {
      Description: "Krusty -\nkrusty-annual_performance-krusty001-jan26-display\n\n- Ad Exchange\n",
      LineAmount: 3855.86,
      Tracking: [{ Name: "Client/Campaign", Option: "Wrong - C24-OTHER-0001" }],
    },
    { Description: "Krusty - \nkrusty-annual_performance-krusty001-jan26-youtube\n\n- Non-ad Exchange\n", LineAmount: 11334.95 },
    { Description: "Krusty Auto \nkrusty-auto_FY26-Annual-Campaign-jul-26-programmatic\n\n- Ad Exchange", LineAmount: 2644.05 },
  ],
}

/** Shape of Five Stones 12016459 (CM360 ad serving): never DV360 media cost. */
const FS_CM360_AUG: RawBillRow = {
  ...FS_DV360_AUG,
  billId: 7063,
  xeroInvoiceId: "fs-cm-aug",
  invoiceNumber: "12016459",
  lineItems: [
    { Description: "Campaign Manager 360\n\n2026.7.1 to 2026.7.31", LineAmount: null },
    { Description: "Krusty - krusty-annual_performance-krusty001-\nmay26", LineAmount: 31.99 },
  ],
}

function cell(over: Partial<FixedCostPlanCell>): FixedCostPlanCell {
  return {
    clientId: 1,
    clientName: "Krusty Krab",
    mbaNumber: "KRUSTY001",
    campaignName: "Annual",
    campaignStatus: "booked",
    lineItemId: "KRUSTY001PD1",
    lineName: "Display",
    publisher: "DV360",
    platform: "DV360",
    channel: "prog_display",
    buyType: "cpm",
    fixedCostMedia: true,
    month: "2026-08",
    basis: "billing",
    amountCents: 0,
    ...over,
  }
}

function spend(lineItemId: string, spendCents: number, source = "DV360"): PlatformSpendCell {
  return { lineItemId, month: "2026-08", source, spendCents, impressions: 1, rowCount: 1 }
}

test("Five Stones: contact, DV360 bill vs CM360 bill, MBA from the line description only", () => {
  assert.equal(isFiveStonesContact("Five Stones"), true)
  assert.equal(isFiveStonesContact("Five Stones Pty Ltd"), true)
  assert.equal(isFiveStonesContact("Channel Factory"), false)
  assert.equal(isDv360Bill(FS_DV360_AUG), true)
  assert.equal(isDv360Bill(FS_CM360_AUG), false)
  assert.deepEqual(parseFiveStonesDv360Bill(FS_CM360_AUG, KNOWN), [])

  const lines = parseFiveStonesDv360Bill(FS_DV360_AUG, KNOWN)
  assert.equal(lines.length, 3)
  assert.deepEqual(
    lines.map((l) => [l.mbaNumber, l.exGstCents, l.month, l.statusClass]),
    [
      ["krusty001", 385586, "2026-08", "counted"],
      ["krusty001", 1133495, "2026-08", "counted"],
      [null, 264405, "2026-08", "counted"],
    ]
  )
  assert.equal(unmatchedDv360Lines(lines).length, 1)
  assert.deepEqual(parseFiveStonesDv360Bill({ ...FS_DV360_AUG, currency: "USD" }, KNOWN), [])
})

test("Five Stones: MBA-month cells, pending kept apart, deleted bills ignored", () => {
  const counted = parseFiveStonesDv360Bill(FS_DV360_AUG, KNOWN)
  const pending = parseFiveStonesDv360Bill({ ...FS_DV360_AUG, xeroInvoiceId: "p", invoiceNumber: "p1", status: "DRAFT" }, KNOWN)
  const deleted = parseFiveStonesDv360Bill({ ...FS_DV360_AUG, xeroInvoiceId: "d", status: "DELETED" }, KNOWN)
  const cells = dv360BillCells([...counted, ...pending, ...deleted])
  assert.equal(cells.length, 1)
  assert.equal(cells[0]!.mbaNumber, "krusty001")
  assert.equal(cells[0]!.countedCents, 1519081)
  assert.equal(cells[0]!.pendingCents, 1519081)
  assert.deepEqual(cells[0]!.statuses, ["PAID", "DRAFT"])
  assert.deepEqual(cells[0]!.invoiceNumbers, ["12034755", "p1"])
})

test("Five Stones: line id to MBA needs a letter after the MBA; spend summed per MBA-month", () => {
  assert.equal(mbaOfLineId("krusty001pd1", ["krusty001"]), "krusty001")
  assert.equal(mbaOfLineId("krusty0011pd1", ["krusty001"]), null)
  assert.equal(mbaOfLineId("krusty0011pd1", ["krusty001", "krusty0011"]), "krusty0011")
  assert.equal(mbaOfLineId("0b2743d52542e51e", ["krusty001"]), null)
  const byMba = dv360SpendByMbaMonth(
    [
      { lineItemId: "krusty001pd1", month: "2026-08", spendCents: 443506 },
      { lineItemId: "krusty001pd2", month: "2026-08", spendCents: 84674 },
      { lineItemId: "krusty001pv1", month: "2026-08", spendCents: 1020573 },
      { lineItemId: "krusty001pv2", month: "2026-08", spendCents: 554640 },
      { lineItemId: "krusty0011pd1", month: "2026-08", spendCents: 999 },
    ],
    ["krusty001"]
  )
  assert.deepEqual([...byMba.entries()], [["krusty001|2026-08", 2103393]])
  assert.deepEqual(dv360Gap(2103393, 1519081), { gapCents: 584312, gapPct: 584312 / 2103393 })
  assert.deepEqual(dv360Gap(0, 100), { gapCents: -100, gapPct: null })
})

test("compose: Five Stones share and gap per DV360 line-month; margin still uses AMOUNT_SPENT", () => {
  const bills = dv360CheckCells(
    dv360BillCells(parseFiveStonesDv360Bill(FS_DV360_AUG, KNOWN)),
    new Map([["krusty001|2026-08", 2103393]])
  )
  const plan = [
    cell({ lineItemId: "KRUSTY001PD1", amountCents: 500000 }),
    cell({ lineItemId: "KRUSTY001PV1", publisher: "YouTube - DV360", amountCents: 1200000 }),
    // Taboola line on the same MBA: never gets a Five Stones share.
    cell({ lineItemId: "KRUSTY001PD3", publisher: "Taboola", platform: "Taboola", amountCents: 300000 }),
  ]
  const lines = composeFixedCostMargin({
    plan,
    spend: [spend("krusty001pd1", 443506), spend("krusty001pv1", 1020573), spend("krusty001pd3", 120000, "Taboola")],
    invoiced: new Set(),
    from: "2026-07",
    to: "2027-06",
    dv360Bills: bills,
  })
  const pd1 = lines.find((l) => l.lineItemId === "KRUSTY001PD1")!.months[0]!
  const pv1 = lines.find((l) => l.lineItemId === "KRUSTY001PV1")!.months[0]!
  const pd3 = lines.find((l) => l.lineItemId === "KRUSTY001PD3")!.months[0]!

  // Margin is unchanged: billed minus AMOUNT_SPENT.
  assert.equal(pd1.actualCents, 443506)
  assert.equal(pd1.marginCents, 500000 - 443506)
  // Share = 1,519,081 x 443,506 / 2,103,393.
  assert.equal(pd1.fiveStonesBillCents, fiveStonesShareCents(1519081, 443506, 2103393))
  assert.equal(pd1.fiveStonesBillCents, Math.round((1519081 * 443506) / 2103393))
  assert.equal(pd1.fiveStonesGapCents, 443506 - pd1.fiveStonesBillCents!)
  assert.ok(Math.abs(pd1.fiveStonesGapPct! - 584312 / 2103393) < 1e-5)
  assert.ok(Math.abs(pv1.fiveStonesGapPct! - pd1.fiveStonesGapPct!) < 1e-5)
  assert.equal(pd3.fiveStonesBillCents, null)
  assert.equal(pd3.dv360SpendCents, 0)

  const summary = summariseFixedCostMargin(lines)
  assert.equal(summary.grand.fiveStonesSpendCents, 443506 + 1020573)
  assert.equal(summary.grand.fiveStonesBillCents, pd1.fiveStonesBillCents! + pv1.fiveStonesBillCents!)
  assert.equal(summary.grand.actualCents, 443506 + 1020573 + 120000)

  const rows = buildDv360CheckRows(lines, bills)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0]!.lineItemIds, ["KRUSTY001PD1", "KRUSTY001PV1"])
  assert.equal(rows[0]!.mbaDv360SpendCents, 2103393)
  assert.equal(rows[0]!.reportDv360SpendCents, 443506 + 1020573)
  assert.equal(rows[0]!.fiveStonesBillCents, 1519081)
  assert.equal(rows[0]!.gapCents, 584312)
})

test("compose: no Five Stones bill, or bills out of range, leave the columns empty", () => {
  const lines = composeFixedCostMargin({
    plan: [cell({ amountCents: 500000 })],
    spend: [spend("krusty001pd1", 443506)],
    invoiced: new Set(),
    from: "2026-09",
    to: "2027-06",
    dv360Bills: [
      { mbaNumber: "krusty001", month: "2026-08", countedCents: 100, pendingCents: 0, mbaDv360SpendCents: 443506, statuses: ["PAID"], invoiceNumbers: ["x"] },
    ],
  })
  assert.equal(lines.length, 0)
  const inRange = composeFixedCostMargin({
    plan: [cell({ amountCents: 500000 })],
    spend: [spend("krusty001pd1", 443506)],
    invoiced: new Set(),
    from: "2026-07",
    to: "2027-06",
  })
  assert.equal(inRange[0]!.months[0]!.fiveStonesBillCents, null)
  assert.equal(inRange[0]!.months[0]!.dv360SpendCents, 443506)
  assert.equal(fiveStonesShareCents(100, 0, 10), null)
  assert.equal(fiveStonesShareCents(0, 10, 10), null)
  assert.equal(fiveStonesShareCents(-300, 1, 2), -150)
})

test("workbook: DV360 vs Five Stones sheet and the line-month columns", async () => {
  const bills = dv360CheckCells(
    dv360BillCells(parseFiveStonesDv360Bill(FS_DV360_AUG, KNOWN)),
    new Map([["krusty001|2026-08", 2103393]])
  )
  const lines = composeFixedCostMargin({
    plan: [cell({ amountCents: 500000 })],
    spend: [spend("krusty001pd1", 443506)],
    invoiced: new Set(),
    from: "2026-07",
    to: "2027-06",
    dv360Bills: bills,
  })
  const rows = buildDv360CheckRows(lines, bills)
  const bytes = await buildFixedCostMarginWorkbookBytes(lines, summariseFixedCostMargin(lines), ["n"], {
    billLines: [],
    billTotals: [],
    dv360Rows: rows,
  })
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  const sheet = wb.getWorksheet("DV360 vs Five Stones")
  assert.ok(sheet)
  assert.equal(sheet!.getRow(1).getCell(7).value, "Five Stones bill (ex GST)")
  assert.equal(sheet!.getRow(2).getCell(2).value, "krusty001")
  assert.equal(sheet!.getRow(2).getCell(7).value, 15190.81)
  assert.equal(sheet!.getRow(2).getCell(9).value, 5843.12)
  const lm = wb.getWorksheet("Line months")!
  assert.equal(lm.getRow(1).getCell(23).value, "Five Stones bill (DV360, MBA-month share)")
  assert.equal(lm.getRow(2).getCell(22).value, 4435.06)
  assert.equal(typeof lm.getRow(2).getCell(23).value, "number")
})
