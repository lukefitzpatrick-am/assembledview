import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { detectPlanStructure } from "../detectPlanStructure.js"

async function buildFixtureBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Schedule")
  ws.getCell(1, 1).value = "Client"
  ws.getCell(1, 2).value = "Acme Co"
  ws.getCell(2, 1).value = "Campaign"
  ws.getCell(2, 2).value = "Spring radio"
  // Header row 4
  ws.getCell(4, 1).value = "Market"
  ws.getCell(4, 2).value = "Network"
  ws.getCell(4, 3).value = "Station"
  ws.getCell(4, 4).value = "Spot Rate"
  // Flight dates row 3 (above header) — weekly band
  ws.getCell(3, 5).value = new Date("2026-03-02")
  ws.getCell(3, 6).value = new Date("2026-03-09")
  ws.getCell(3, 7).value = new Date("1900-01-01") // junk
  ws.getCell(4, 7).value = "Error"
  // Data
  ws.getCell(5, 1).value = "Sydney"
  ws.getCell(5, 2).value = "SCA"
  ws.getCell(5, 3).value = "2DAY"
  ws.getCell(5, 4).value = 120
  ws.getCell(5, 5).value = 3
  ws.getCell(5, 6).value = 2

  const qa = wb.addWorksheet("Double Check")
  qa.getCell(1, 1).value = "ignore"

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

test("detectPlanStructure: picks schedule sheet, meta, header, flight, junk", async () => {
  const detected = await detectPlanStructure(await buildFixtureBuffer())
  assert.equal(detected.sheetName, "Schedule")
  assert.equal(detected.meta.client, "Acme Co")
  assert.equal(detected.headerRow, 4)
  assert.ok(detected.lineItemColumns.some((c) => /market/i.test(c.header)))
  assert.equal(detected.flight.columns.length, 2)
  assert.equal(detected.flight.granularity, "weekly")
  assert.ok(detected.junkColumns.length >= 1)
  assert.ok(detected.grid.length >= 2)
  assert.ok(detected.costColumns.some((c) => /rate/i.test(c.header)) || detected.lineItemColumns.length > 0)
})
