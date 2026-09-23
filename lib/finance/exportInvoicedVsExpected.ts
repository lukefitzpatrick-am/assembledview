import {
  INVOICED_VS_EXPECTED_COLUMNS,
  invoicedVsExpectedFilename,
  type FyChoice,
  type PairRow,
} from "@/lib/finance/invoicedVsExpected"

function dollars(cents: number | null): number | null {
  if (cents == null) return null
  return cents / 100
}

function rowValues(row: PairRow): (string | number | null)[] {
  return [
    row.month,
    row.clientName,
    row.reference,
    row.billingType,
    dollars(row.expectedCents),
    row.source,
    dollars(row.invoicedCents),
    dollars(row.deltaCents),
    row.invoiceNumber,
    row.xeroStatus,
    row.resolution,
  ]
}

export async function buildInvoicedVsExpectedWorkbook(rows: PairRow[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Invoiced vs expected")
  sheet.addRow([...INVOICED_VS_EXPECTED_COLUMNS])
  const header = sheet.getRow(1)
  header.font = { bold: true }
  for (const row of rows) {
    const added = sheet.addRow(rowValues(row))
    for (const col of [5, 7, 8]) {
      const cell = added.getCell(col)
      if (typeof cell.value === "number") cell.numFmt = '"$"#,##0.00'
    }
  }
  sheet.columns.forEach((column) => {
    column.width = 22
  })
  const out = await workbook.xlsx.writeBuffer()
  return Buffer.from(out)
}

export { invoicedVsExpectedFilename, type FyChoice }
