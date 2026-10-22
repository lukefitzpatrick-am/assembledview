import {
  PLAN_RECONCILIATION_COLUMNS,
  type PlanReconciliationRow,
} from "@/lib/finance/planReconciliation"

function dollars(cents: number | null): number | null {
  if (cents == null) return null
  return cents / 100
}

function rowValues(row: PlanReconciliationRow): (string | number | null)[] {
  return [
    row.month,
    row.clientName,
    row.mbaNumber,
    row.campaignName,
    dollars(row.planCents),
    dollars(row.financeCents),
    row.financeSource,
    dollars(row.exportCents),
    dollars(row.gapCents),
    dollars(row.exportGapCents),
    row.status,
    row.reasonText,
  ]
}

const MONEY_COLUMNS = [5, 6, 8, 9, 10] as const

export async function buildPlanReconciliationWorkbook(rows: PlanReconciliationRow[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Plan reconciliation")
  sheet.addRow([...PLAN_RECONCILIATION_COLUMNS])
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) {
    const added = sheet.addRow(rowValues(row))
    for (const col of MONEY_COLUMNS) {
      const cell = added.getCell(col)
      if (typeof cell.value === "number") cell.numFmt = '"$"#,##0.00'
    }
  }
  sheet.columns.forEach((column, index) => {
    column.width = index === PLAN_RECONCILIATION_COLUMNS.length - 1 ? 60 : 20
  })
  const out = await workbook.xlsx.writeBuffer()
  return Buffer.from(out)
}
