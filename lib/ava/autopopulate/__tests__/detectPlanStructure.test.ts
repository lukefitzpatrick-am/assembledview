import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ExcelJS from "exceljs"
import {
  detectPlanStructure,
  pickPrimaryWorksheet,
  scoreWorksheetForPrimary,
} from "../detectPlanStructure.js"

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

async function buildPaidVsBonusBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const paid = wb.addWorksheet("QMS_2026_Paid")
  paid.getCell(1, 1).value = "Site Number"
  paid.getCell(1, 2).value = "Address"
  paid.getCell(1, 3).value = new Date("2026-06-01")
  paid.getCell(1, 4).value = new Date("2026-06-08")
  // Smaller than Bonus → old heuristic preferred Bonus
  for (let r = 2; r <= 20; r++) {
    paid.getCell(r, 1).value = `P-${r}`
    paid.getCell(r, 3).value = 1
  }

  const bonus = wb.addWorksheet("QMS_2026_Bonus")
  bonus.getCell(1, 1).value = "Site Number"
  bonus.getCell(1, 2).value = "Address"
  bonus.getCell(1, 3).value = new Date("2026-06-01")
  bonus.getCell(1, 4).value = new Date("2026-06-08")
  for (let r = 2; r <= 40; r++) {
    bonus.getCell(r, 1).value = `B-${r}`
    bonus.getCell(r, 3).value = 1
  }

  const move = wb.addWorksheet("Campaign MOVE Summary")
  move.getCell(1, 1).value = "Client"
  move.getCell(1, 2).value = "Strength Meals"

  return Buffer.from(await wb.xlsx.writeBuffer())
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
  assert.ok(
    detected.costColumns.some((c) => /rate/i.test(c.header)) ||
      detected.lineItemColumns.length > 0
  )
})

test("pickPrimaryWorksheet: Paid preferred over larger Bonus sheet", async () => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(
    (await buildPaidVsBonusBuffer()) as unknown as ExcelJS.Buffer
  )
  const primary = pickPrimaryWorksheet(wb.worksheets)
  assert.equal(primary.name, "QMS_2026_Paid")
  assert.ok(
    scoreWorksheetForPrimary(wb.getWorksheet("QMS_2026_Bonus")!) <
      scoreWorksheetForPrimary(wb.getWorksheet("QMS_2026_Paid")!)
  )
})

test("detectPlanStructure: QMS-like workbook selects Paid and exposes Bonus second pass", async () => {
  const detected = await detectPlanStructure(await buildPaidVsBonusBuffer())
  assert.equal(detected.sheetName, "QMS_2026_Paid")
  assert.ok(detected.bonusSheets?.length)
  assert.equal(detected.bonusSheets![0]?.sheetName, "QMS_2026_Bonus")
  assert.equal(detected.bonusSheets![0]?.isBonusSheet, true)
})

test("detectPlanStructure: ARN-style text-month + week-number flight", async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("ARN Schedule")
  ws.getCell(1, 1).value = "Client"
  ws.getCell(1, 2).value = "Boss Engineering"
  // Year / month / week-number rows (cols 3–6)
  ws.getCell(3, 3).value = 2025
  ws.getCell(3, 4).value = 2025
  ws.getCell(3, 5).value = 2025
  ws.getCell(3, 6).value = 2025
  ws.getCell(4, 1).value = "Station"
  ws.getCell(4, 2).value = "Spot Rate"
  ws.getCell(4, 3).value = "JULY"
  ws.getCell(4, 4).value = "JULY"
  ws.getCell(4, 5).value = "AUG"
  ws.getCell(4, 6).value = "AUG"
  ws.getCell(5, 3).value = 7
  ws.getCell(5, 4).value = 14
  ws.getCell(5, 5).value = 4
  ws.getCell(5, 6).value = 11
  ws.getCell(6, 1).value = "2DAY"
  ws.getCell(6, 2).value = 100
  ws.getCell(6, 3).value = 2

  const detected = await detectPlanStructure(
    Buffer.from(await wb.xlsx.writeBuffer())
  )
  assert.equal(detected.sheetName, "ARN Schedule")
  assert.equal(detected.flight.granularity, "textMonthWeekly")
  assert.ok(detected.flight.columns.length >= 4)
  assert.equal(detected.flight.columns[0]?.date, "2025-07-07")
  assert.equal(detected.flight.columns[1]?.date, "2025-07-14")
})
