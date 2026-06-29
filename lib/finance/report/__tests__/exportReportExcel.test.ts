import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"

import { exportReportExcel } from "../exportReportExcel.js"
import type { SubtotalNode } from "../groupAndSubtotal.js"

const root: SubtotalNode = {
  dimension: null,
  key: "Grand Total",
  rowCount: 3,
  measures: { totalBillable: 175, mediaSpend: 140, agencyFee: 35 },
  leafRows: [],
  children: [
    {
      dimension: "mediaType",
      key: "Search",
      rowCount: 2,
      measures: { totalBillable: 125, mediaSpend: 100, agencyFee: 25 },
      leafRows: [],
      children: [
        {
          dimension: "publisher",
          key: "Google",
          rowCount: 2,
          measures: { totalBillable: 125, mediaSpend: 100, agencyFee: 25 },
          leafRows: [],
          children: [],
        },
      ],
    },
    {
      dimension: "mediaType",
      key: "Radio",
      rowCount: 1,
      measures: { totalBillable: 50, mediaSpend: 40, agencyFee: 10 },
      leafRows: [],
      children: [],
    },
  ],
}

async function loadWorkbook(blob: Blob): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  return workbook
}

test("exportReportExcel writes grouped subtotal rows and numeric grand total cells", async () => {
  const blob = await exportReportExcel(root, ["mediaType", "publisher"], {
    filterLabel: "May 2026 · media/booked",
  })

  const workbook = await loadWorkbook(blob)
  const sheet = workbook.getWorksheet("Report")
  assert.ok(sheet)

  assert.equal(sheet.getCell("A1").value, "Finance subtotal report")
  assert.equal(sheet.getCell("B3").value, "mediaType → publisher")
  assert.equal(sheet.getCell("B4").value, "May 2026 · media/booked")

  assert.equal(sheet.getCell("A7").value, "Search")
  assert.equal(sheet.getCell("B7").value, "mediaType")
  assert.equal(sheet.getCell("C7").value, 125)
  assert.equal(sheet.getCell("C7").numFmt, '"$"#,##0.00')

  assert.equal(sheet.getCell("A8").value, "Google")
  assert.equal(sheet.getCell("A8").alignment?.indent, 1)
  assert.equal(sheet.getCell("B8").value, "publisher")
  assert.equal(sheet.getCell("D8").value, 100)
  assert.equal(sheet.getCell("E8").value, 25)

  assert.equal(sheet.getCell("A11").value, "Grand total")
  assert.equal(sheet.getCell("C11").value, 175)
  assert.equal(sheet.getCell("D11").value, 140)
  assert.equal(sheet.getCell("E11").value, 35)
  assert.equal(sheet.getCell("E11").numFmt, '"$"#,##0.00')
})
