import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { deriveRetainerBillingRecordsForMonth } from "../deriveRetainerReceivables.js"
import { retainerRecordDescription, writeRetainerFinanceWorksheet } from "../excelFinanceExport.js"

test("retainerRecordDescription: uses the derived row's line description", () => {
  const [r] = deriveRetainerBillingRecordsForMonth(
    [{ id: 7, clientname_input: "Client A", monthlyretainer: 3000 }],
    2026,
    10
  )
  assert.equal(retainerRecordDescription(r), "Monthly retainer, October 2026")
  assert.equal(
    retainerRecordDescription({ billing_month: "2026-09", line_items: [] }),
    "Monthly retainer, September 2026"
  )
})

test("writeRetainerFinanceWorksheet: workbook writes the row's description", async () => {
  const wb = new ExcelJS.Workbook()
  await writeRetainerFinanceWorksheet(wb, "Retainer", {
    clientName: "Client A",
    mbaIdentifier: "clia",
    paymentDays: 30,
    paymentTerms: "Net 30 days",
    invoiceDateIso: "2026-10-31",
    monthlyRetainer: 3000,
    description: "Monthly retainer, October 2026",
  })
  const ws = wb.getWorksheet("Retainer")!
  const values: string[] = []
  ws.eachRow((row) => {
    const v = row.getCell(3).value
    if (typeof v === "string") values.push(v)
  })
  assert.ok(values.includes("Monthly retainer, October 2026"), values.join(" | "))
  assert.ok(!values.includes("Monthly retainer"))
})

test("toBillCaptionLabel: the new retainer description still reads as Retainer", async () => {
  const { toBillCaptionLabel } = await import("../sections/invoicingRowPresentation.js")
  const label = toBillCaptionLabel({
    id: 0,
    finance_billing_records_id: 0,
    item_code: "",
    line_type: "other" as never,
    media_type: null,
    description: "Monthly retainer, October 2026",
    publisher_name: null,
    amount: 1,
    client_pays_media: false,
    sort_order: 0,
  })
  assert.equal(label, "Retainer")
})
