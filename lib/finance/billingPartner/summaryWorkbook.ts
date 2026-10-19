import type { DueAaPlan } from "@/lib/finance/billingPartner/duePlans"
import { monthsChangedLabel, packSummaryFileName } from "@/lib/finance/billingPartner/cycle"

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function changeKindLabel(kind: DueAaPlan["changeKind"]): "New" | "Amended" {
  return kind === "new" ? "New" : "Amended"
}

export async function buildAaPackSummaryWorkbook(input: {
  billingMonth: string
  plans: DueAaPlan[]
}): Promise<{ buffer: Buffer; fileName: string; mime: string }> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Summary")
  const months = [
    ...new Set(input.plans.flatMap((plan) => Object.keys(plan.aaMonthTotals))),
  ].sort()

  sheet.addRow([
    "Client",
    "Campaign",
    "MBA",
    "Version",
    "New/Amended",
    "Months changed",
    "Back-dated",
    ...months.map((month) => `AA total ${month}`),
  ])

  for (const plan of input.plans) {
    sheet.addRow([
      plan.clientName,
      plan.campaignName,
      plan.mbaNumber,
      plan.versionNumber,
      changeKindLabel(plan.changeKind),
      monthsChangedLabel(plan.monthsChanged, plan.comparedTo),
      plan.backDated ? "Yes" : "No",
      ...months.map((month) =>
        Object.prototype.hasOwnProperty.call(plan.aaMonthTotals, month)
          ? plan.aaMonthTotals[month]
          : null,
      ),
    ])
  }

  sheet.getColumn(1).width = 28
  sheet.getColumn(2).width = 28
  sheet.getColumn(3).width = 16
  for (let index = 0; index < months.length; index += 1) {
    sheet.getColumn(8 + index).numFmt = "$#,##0.00"
  }

  const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
  return { buffer, fileName: packSummaryFileName(input.billingMonth), mime: XLSX }
}
