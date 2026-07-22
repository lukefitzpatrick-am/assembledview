/**
 * Excel/CSV export for Phase-1 target vs actual variance (client × month tracker shape).
 */

import type ExcelJS from "exceljs"
import { format } from "date-fns"

import type { FinanceForecastMonthKey } from "@/lib/types/financeForecast"
import type { TargetVsActualReport } from "@/lib/finance/forecast/variance/targetVsActual"
import { fyExportLabel } from "@/lib/finance/forecast/exportFinanceForecast"

function monthColumnLabel(key: FinanceForecastMonthKey, fyStart: number): string {
  const calMonth: Record<FinanceForecastMonthKey, number> = {
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
  }
  const m = calMonth[key]
  const year = m >= 7 ? fyStart : fyStart + 1
  return format(new Date(year, m - 1, 1), "MMM yy")
}

const headerStyle: Partial<ExcelJS.Style> = {
  font: { bold: true, size: 11 },
  fill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8E8" },
  },
  border: {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  },
}

export function targetVsActualExportFilenameStem(
  report: TargetVsActualReport,
  exportedAt: Date = new Date()
): string {
  const fyShort = `${report.financial_year_start_year}-${String(report.financial_year_start_year + 1).slice(-2)}`
  const stamp = format(exportedAt, "yyyyMMdd_HHmm")
  return `Finance_Variance_TargetVsActual_FY${fyShort}_${stamp}`
}

/**
 * Workbook: About + Variance sheet (Client, Month, Target, Actual, Delta, Delta %, Booked).
 */
export async function buildTargetVsActualWorkbook(
  report: TargetVsActualReport,
  exportedAt: Date = new Date()
): Promise<ExcelJS.Workbook> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Finance Forecast Variance"

  const about = workbook.addWorksheet("About")
  about.getColumn(1).width = 32
  about.getColumn(2).width = 56
  const meta: [string, string][] = [
    ["Generated (UTC)", exportedAt.toISOString()],
    ["Financial year", fyExportLabel(report.financial_year_start_year)],
    ["Phase", String(report.phase)],
    ["Actual source", report.actual_source],
    ["Actual grain", report.actual_grain],
    ["FY target total", String(report.totals.target)],
    ["FY actual total", String(report.totals.actual)],
    ["FY booked (ref) total", String(report.totals.booked)],
    ["FY delta", String(report.totals.delta)],
    [
      "Phase-2 note",
      "Replace/augment actuals with Xero AR at client_id + month_key before buildTargetVsActualVariance.",
    ],
  ]
  let r = 1
  for (const [label, value] of meta) {
    about.getCell(r, 1).value = label
    about.getCell(r, 1).font = { bold: true }
    about.getCell(r, 2).value = value
    r++
  }

  const ws = workbook.addWorksheet("Variance")
  const fy = report.financial_year_start_year
  const headers = [
    "Client",
    "Client ID",
    "Month",
    "Target",
    "Actual",
    "Delta",
    "Delta %",
    "Booked (schedules)",
    "RAG",
  ]
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = h
    cell.style = headerStyle as ExcelJS.Style
  })

  let rowIndex = 2
  for (const client of report.clients) {
    for (const month of client.months) {
      if (month.target === 0 && month.actual === 0 && month.booked === 0) continue
      ws.getCell(rowIndex, 1).value = client.client_name
      ws.getCell(rowIndex, 2).value = client.client_id
      ws.getCell(rowIndex, 3).value = monthColumnLabel(month.month_key, fy)
      for (const [col, val] of [
        [4, month.target],
        [5, month.actual],
        [6, month.delta],
        [8, month.booked],
      ] as const) {
        const cell = ws.getCell(rowIndex, col)
        cell.value = val
        cell.numFmt = "$#,##0.00"
      }
      ws.getCell(rowIndex, 7).value = month.delta_pct
      if (month.delta_pct != null) ws.getCell(rowIndex, 7).numFmt = "0.0"
      ws.getCell(rowIndex, 9).value = month.rag
      rowIndex++
    }
    // FY rollup row
    ws.getCell(rowIndex, 1).value = client.client_name
    ws.getCell(rowIndex, 2).value = client.client_id
    ws.getCell(rowIndex, 3).value = "FY total"
    ws.getCell(rowIndex, 3).font = { bold: true }
    for (const [col, val] of [
      [4, client.fy.target],
      [5, client.fy.actual],
      [6, client.fy.delta],
      [8, client.fy.booked],
    ] as const) {
      const cell = ws.getCell(rowIndex, col)
      cell.value = val
      cell.numFmt = "$#,##0.00"
      cell.font = { bold: true }
    }
    ws.getCell(rowIndex, 7).value = client.fy.delta_pct
    if (client.fy.delta_pct != null) ws.getCell(rowIndex, 7).numFmt = "0.0"
    ws.getCell(rowIndex, 7).font = { bold: true }
    ws.getCell(rowIndex, 9).value = client.fy.rag
    rowIndex++
  }

  // Portfolio totals
  ws.getCell(rowIndex, 1).value = "Portfolio"
  ws.getCell(rowIndex, 3).value = "FY total"
  for (const [col, val] of [
    [4, report.totals.target],
    [5, report.totals.actual],
    [6, report.totals.delta],
    [8, report.totals.booked],
  ] as const) {
    const cell = ws.getCell(rowIndex, col)
    cell.value = val
    cell.numFmt = "$#,##0.00"
    cell.font = { bold: true }
  }
  ws.getCell(rowIndex, 7).value = report.totals.delta_pct
  if (report.totals.delta_pct != null) ws.getCell(rowIndex, 7).numFmt = "0.0"
  ws.getCell(rowIndex, 9).value = report.totals.rag

  ws.getColumn(1).width = 28
  ws.getColumn(2).width = 12
  ws.getColumn(3).width = 12
  for (let c = 4; c <= 8; c++) ws.getColumn(c).width = 14
  ws.getColumn(9).width = 10

  return workbook
}
