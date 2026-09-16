import type { KPISheetRow } from "@/lib/generateMediaPlan"
import type { ResolvedKPIRow } from "@/lib/kpi/types"

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function toKpiSheetRows(kpiRows: ResolvedKPIRow[]): KPISheetRow[] {
  return kpiRows.map((r) => ({
    mediaType: r.media_type,
    publisher: r.publisher,
    label: r.lineItemLabel,
    buyType: r.buyType,
    spend: r.spend,
    deliverables: r.deliverables,
    ctr: r.ctr,
    vtr: r.vtr,
    cpv: r.cpv,
    conversion_rate: r.conversion_rate,
    frequency: r.frequency,
    calculatedClicks: r.calculatedClicks,
    calculatedViews: r.calculatedViews,
    calculatedReach: r.calculatedReach,
  }))
}

export async function buildKpiWorkbookBlob(kpiRows: ResolvedKPIRow[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const { addKPISheet } = await import("@/lib/generateMediaPlan")
  const workbook = new ExcelJS.Workbook()
  addKPISheet(workbook, toKpiSheetRows(kpiRows))
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}
