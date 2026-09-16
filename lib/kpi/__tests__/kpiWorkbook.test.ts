import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { buildKpiWorkbookBlob } from "../kpiWorkbook.js"
import type { ResolvedKPIRow } from "../types.js"

const EXPECTED_HEADERS = [
  "",
  "Publisher",
  "Creative / Targeting",
  "Buy Type",
  "Spend",
  "Deliverables",
  "CTR",
  "VTR",
  "Conv Rate",
  "Frequency",
  "Est. Clicks",
  "Est. Views",
  "Est. Reach",
]

function kpiRow(over: Partial<ResolvedKPIRow> = {}): ResolvedKPIRow {
  return {
    mp_client_name: "Client",
    mba_number: "MBA99",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "search",
    publisher: "Google",
    bid_strategy: "cpc",
    ctr: 0.02,
    cpv: null,
    conversion_rate: 0.05,
    vtr: null,
    frequency: null,
    lineItemId: "MBA99SE01",
    lineItemLabel: "Brand search",
    spend: 1000,
    deliverables: 500,
    buyType: "cpc",
    source: "default",
    isManuallyEdited: false,
    calculatedClicks: 500,
    calculatedViews: null,
    calculatedReach: null,
    ...over,
  }
}

async function loadWorkbook(blob: Blob): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  return workbook
}

function headerRowNumber(sheet: ExcelJS.Worksheet): number {
  let found = 0
  sheet.eachRow((row, rowNumber) => {
    if (row.getCell(2).value === "Publisher") found = rowNumber
  })
  return found
}

test("buildKpiWorkbookBlob writes a Campaign KPIs sheet with three data rows and expected headers", async () => {
  const rows = [
    kpiRow({ publisher: "Google", lineItemLabel: "Brand search", lineItemId: "MBA99SE01" }),
    kpiRow({ publisher: "Microsoft", lineItemLabel: "Generic search", lineItemId: "MBA99SE02" }),
    kpiRow({ publisher: "Amazon", lineItemLabel: "Shopping", lineItemId: "MBA99SE03" }),
  ]

  const blob = await buildKpiWorkbookBlob(rows)
  const workbook = await loadWorkbook(blob)
  const sheet = workbook.getWorksheet("Campaign KPIs")
  assert.ok(sheet, "workbook must contain a Campaign KPIs sheet")

  const headerRow = headerRowNumber(sheet)
  assert.ok(headerRow > 0, "sheet must include the KPI column header row")
  assert.deepEqual(
    Array.from({ length: 13 }, (_, i) => sheet.getCell(headerRow, i + 1).value ?? ""),
    EXPECTED_HEADERS,
  )

  const dataPublishers: string[] = []
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const first = String(sheet.getCell(r, 1).value ?? "")
    if (first.startsWith("Total") || first === "Grand Total") break
    const publisher = String(sheet.getCell(r, 2).value ?? "")
    if (publisher) dataPublishers.push(publisher)
  }
  assert.deepEqual(dataPublishers, ["Google", "Microsoft", "Amazon"])
})
