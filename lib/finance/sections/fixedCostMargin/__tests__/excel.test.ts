/**
 * Fixed cost margin "Download Excel": one row per line-month plus totals sheets.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  composeFixedCostMargin,
  FIXED_COST_MARGIN_NOTES,
  summariseFixedCostMargin,
  type FixedCostPlanCell,
} from "../compose.js"
import { buildFixedCostMarginWorkbookBytes, fixedCostMarginFileStem } from "../excel.js"

function cell(over: Partial<FixedCostPlanCell>): FixedCostPlanCell {
  return {
    clientId: 1,
    clientName: "Krusty Krab",
    mbaNumber: "KK001",
    campaignName: "Spring",
    campaignStatus: "booked",
    lineItemId: "KK001PV1",
    lineName: "Video",
    publisher: "YouTube - DV360",
    platform: "YouTube - DV360",
    channel: "prog_video",
    buyType: "cpv",
    fixedCostMedia: true,
    month: "2026-10",
    basis: "billing",
    amountCents: 0,
    ...over,
  }
}

test("workbook: bill lines sheet lists matched and unmatched lines with gross, rebate and net", async () => {
  const bytes = await buildFixedCostMarginWorkbookBytes([], summariseFixedCostMargin([]), ["n"], {
    billLines: [
      {
        key: "a#1",
        supplier: "Advertising Associates",
        supplierKind: "Advertising Associates",
        invoiceNumber: "Krusty | KRUSTY001 | 1",
        status: "AUTHORISED",
        statusClass: "counted",
        issueDate: "2026-09-30",
        billedMonth: "2026-09",
        deliveredMonth: "2026-08",
        description: "National National Seven Network Sun-Sat 23/08/2026",
        kind: "media",
        placementId: null,
        ioId: null,
        mediaOwnerText: "Seven Network",
        publisher: "Seven",
        mbaNumber: "krusty001",
        mbaSource: "invoice_number",
        clientName: "Krusty Krab",
        lineItemId: null,
        inReport: false,
        state: "ambiguous",
        method: null,
        candidates: ["krusty001tv1", "krusty001dv1"],
        reason: "2 Seven lines on krusty001 fit; match by hand",
        grossCents: 1_000_000,
        rebateCents: 80_000,
        netCents: 920_000,
      },
    ],
    billTotals: [],
  })
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  const ws = wb.getWorksheet("Bill lines")!
  assert.equal(ws.rowCount, 2)
  const r = ws.getRow(2)
  assert.equal(r.getCell(17).value, "Ambiguous (match by hand)")
  assert.equal(r.getCell(19).value, "krusty001tv1, krusty001dv1")
  assert.equal(r.getCell(21).value, 10_000)
  assert.equal(r.getCell(22).value, 800)
  assert.equal(r.getCell(23).value, 9_200)
})

test("workbook: line months, totals sheets, negative margin kept as a negative number", async () => {
  const lines = composeFixedCostMargin({
    plan: [cell({ amountCents: 100_00 }), cell({ lineItemId: "KK001DD1", publisher: "News Corp", amountCents: 50_00 })],
    spend: [
      {
        lineItemId: "kk001pv1",
        month: "2026-10",
        source: "DV360",
        spendCents: 130_00,
        impressions: 10,
        rowCount: 3,
      },
    ],
    invoiced: new Set(),
    from: "2026-07",
    to: "2027-06",
  })
  const summary = summariseFixedCostMargin(lines)
  const bytes = await buildFixedCostMarginWorkbookBytes(lines, summary, ["Note one", ...FIXED_COST_MARGIN_NOTES])

  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ["Line months", "By client", "By publisher", "By month", "Billed vs delivered", "Bill lines", "Bill match totals", "DV360 vs Five Stones", "Notes"]
  )
  const ws = wb.getWorksheet("Line months")!
  assert.equal(ws.rowCount, 3)
  const pv = ws.getRow(2)
  assert.equal(pv.getCell(4).value, "KK001DD1")
  const pv1 = ws.getRow(3)
  assert.equal(pv1.getCell(4).value, "KK001PV1")
  assert.equal(pv1.getCell(10).value, 100)
  assert.equal(ws.getRow(1).getCell(12).value, "Actual cost")
  assert.equal(ws.getRow(1).getCell(16).value, "Cost from")
  assert.equal(pv1.getCell(16).value, "Platform spend")
  assert.equal(ws.getRow(1).getCell(13).value, "Margin $")
  assert.equal(pv1.getCell(12).value, 130)
  assert.equal(pv1.getCell(13).value, -30)
  assert.equal(pv1.getCell(14).value, -0.3)
  assert.match(String(pv1.getCell(15).value), /Negative margin/)
  assert.equal(ws.getRow(2).getCell(13).value, null)
  assert.match(String(ws.getRow(2).getCell(15).value), /No platform data/)

  const notes = wb.getWorksheet("Notes")!
  const noteText = notes.getColumn(1).values.map((v) => String(v ?? "")).join("\n")
  assert.match(noteText, /DV360 and YouTube \(via DV360\) cost is the DV360 cost in advertiser currency/)
  assert.match(noteText, /Vistar cost is Vistar's reported spend \(Vistar revenue\), which is what Vistar invoices us/)
  assert.match(noteText, /Xero bills/)
  assert.match(noteText, /8% AA rebate \(gross x 0\.92\)/)
  assert.match(noteText, /Only AUTHORISED and PAID bills count as cost/)
  assert.match(noteText, /billed month/)
  assert.match(noteText, /7\.5%/)
  assert.match(noteText, /Production, talent, installation and hot read/)
  assert.doesNotMatch(noteText, /DV360 media cost|total media cost/i)

  const byMonth = wb.getWorksheet("By month")!
  const total = byMonth.getRow(byMonth.rowCount)
  assert.equal(total.getCell(1).value, "Total")
  assert.equal(total.getCell(2).value, 150)
  assert.equal(total.getCell(7).value, -30)

  const timing = wb.getWorksheet("Billed vs delivered")!
  assert.equal(timing.getRow(1).getCell(7).value, "Cost, billed month")
  assert.ok(timing.rowCount >= 2)

  assert.equal(fixedCostMarginFileStem({ from: "2026-07", to: "2026-10" }), "Fixed_cost_margin_2026-07_2026-10")
})
