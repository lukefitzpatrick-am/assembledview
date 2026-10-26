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
    ["Line months", "By client", "By publisher", "By month", "Notes"]
  )
  const ws = wb.getWorksheet("Line months")!
  assert.equal(ws.rowCount, 3)
  const pv = ws.getRow(2)
  assert.equal(pv.getCell(4).value, "KK001DD1")
  const pv1 = ws.getRow(3)
  assert.equal(pv1.getCell(4).value, "KK001PV1")
  assert.equal(pv1.getCell(10).value, 100)
  assert.equal(ws.getRow(1).getCell(12).value, "Actual platform spend")
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
  assert.doesNotMatch(noteText, /DV360 media cost|total media cost/i)

  const byMonth = wb.getWorksheet("By month")!
  const total = byMonth.getRow(byMonth.rowCount)
  assert.equal(total.getCell(1).value, "Total")
  assert.equal(total.getCell(2).value, 150)
  assert.equal(total.getCell(7).value, -30)

  assert.equal(fixedCostMarginFileStem({ from: "2026-07", to: "2026-10" }), "Fixed_cost_margin_2026-07_2026-10")
})
