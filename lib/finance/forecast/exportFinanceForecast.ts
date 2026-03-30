/**
 * Client-side export for Finance Forecast (CSV + Excel).
 * Keeps IO/presentation separate from dataset calculation (`buildFinanceForecastDataset`).
 */

import ExcelJS from "exceljs"
import { format } from "date-fns"

import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_GROUP_LABELS,
  FINANCE_FORECAST_LINE_LABELS,
  type FinanceForecastDataset,
  type FinanceForecastLine,
  type FinanceForecastMonthKey,
  type FinanceForecastScenario,
} from "@/lib/types/financeForecast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FinanceForecastExportApiMeta = {
  financial_year_start_year: number
  scenario: FinanceForecastScenario
  raw_version_count: number
  filtered_version_count: number
  client_scope: string
  include_row_debug: boolean
}

export type FinanceForecastExportFilterState = {
  clientFilter: string
  searchVersions: string
  includeRowDebug: boolean
}

export type FinanceForecastExportRow = {
  section_group: string
  client_name: string
  client_id: string
  line_label: string
} & Record<FinanceForecastMonthKey, number> & { fy_total: number }

// ---------------------------------------------------------------------------
// Labels & rows
// ---------------------------------------------------------------------------

export function scenarioDisplayLabel(scenario: FinanceForecastScenario): string {
  return scenario === "confirmed" ? "Confirmed" : "Confirmed + Probable"
}

export function fyExportLabel(startYear: number): string {
  return `${startYear}–${String(startYear + 1).slice(-2)}`
}

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

function lineExportLabel(line: FinanceForecastLine): string {
  const label = FINANCE_FORECAST_LINE_LABELS[line.line_key]
  return [label, line.mba_number ? `MBA ${line.mba_number}` : null, line.version_number != null ? `v${line.version_number}` : null]
    .filter(Boolean)
    .join(" · ")
}

export function buildFinanceForecastExportRows(dataset: FinanceForecastDataset): FinanceForecastExportRow[] {
  const rows: FinanceForecastExportRow[] = []
  for (const block of dataset.client_blocks) {
    for (const group of block.groups) {
      const sectionTitle = group.title ?? FINANCE_FORECAST_GROUP_LABELS[group.group_key]
      for (const line of group.lines) {
        const monthly = {} as Record<FinanceForecastMonthKey, number>
        for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
          monthly[k] = line.monthly[k] ?? 0
        }
        rows.push({
          section_group: sectionTitle,
          client_name: block.client_name,
          client_id: String(block.client_id),
          line_label: lineExportLabel(line),
          ...monthly,
          fy_total: line.fy_total,
        })
      }
    }
  }
  return rows
}

function csvEscapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : ""
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  const s = String(value)
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildMetadataPairs(
  dataset: FinanceForecastDataset,
  filters: FinanceForecastExportFilterState,
  apiMeta: FinanceForecastExportApiMeta | null | undefined,
  exportedAt: Date
): [string, string][] {
  const fy = dataset.meta.financial_year_start_year
  const pairs: [string, string][] = [
    ["Generated (UTC)", exportedAt.toISOString()],
    ["Scenario (dataset)", scenarioDisplayLabel(dataset.meta.scenario)],
    ["Financial year", fyExportLabel(fy)],
    [
      "Client filter (UI)",
      filters.clientFilter.trim().length > 0 ? filters.clientFilter.trim() : "(none — all in scope)",
    ],
    [
      "Search versions (UI)",
      filters.searchVersions.trim().length > 0 ? filters.searchVersions.trim() : "(none)",
    ],
    ["Include row debug (UI)", filters.includeRowDebug ? "yes" : "no"],
  ]
  if (apiMeta) {
    pairs.push(
      ["API scenario", scenarioDisplayLabel(apiMeta.scenario)],
      ["API financial year start", String(apiMeta.financial_year_start_year)],
      ["Versions (after filters)", String(apiMeta.filtered_version_count)],
      ["Versions (raw)", String(apiMeta.raw_version_count)],
      ["Client scope", apiMeta.client_scope],
      ["API include_row_debug flag", apiMeta.include_row_debug ? "yes" : "no"]
    )
  }
  return pairs
}

/**
 * CSV with metadata key/value rows, blank separator, then column header + numeric amount columns.
 */
export function buildFinanceForecastCsvString(
  dataset: FinanceForecastDataset,
  filters: FinanceForecastExportFilterState,
  apiMeta: FinanceForecastExportApiMeta | null | undefined,
  exportedAt: Date = new Date()
): string {
  const metaLines = buildMetadataPairs(dataset, filters, apiMeta, exportedAt).map(
    ([k, v]) => `${csvEscapeCell(k)},${csvEscapeCell(v)}`
  )
  const fy = dataset.meta.financial_year_start_year
  const monthLabels = FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((k) => monthColumnLabel(k, fy))
  const headerKeys = [
    "section_group",
    "client_name",
    "client_id",
    "line_label",
    ...FINANCE_FORECAST_FISCAL_MONTH_ORDER,
    "fy_total",
  ] as const
  const headerDisplay = [
    "Section group",
    "Client",
    "Client ID",
    "Line",
    ...monthLabels,
    "FY total",
  ]
  const headerRow = headerDisplay.map((h) => csvEscapeCell(h)).join(",")

  const dataRows = buildFinanceForecastExportRows(dataset).map((row) =>
    headerKeys.map((key) => csvEscapeCell(row[key] as string | number)).join(",")
  )

  return [...metaLines, "", headerRow, ...dataRows].join("\n")
}

export function financeForecastExportFilenameStem(
  dataset: FinanceForecastDataset,
  exportedAt: Date = new Date()
): string {
  const fyShort = `${dataset.meta.financial_year_start_year}-${String(dataset.meta.financial_year_start_year + 1).slice(-2)}`
  const scen =
    dataset.meta.scenario === "confirmed" ? "confirmed" : "confirmed_probable"
  const stamp = format(exportedAt, "yyyyMMdd-HHmmss")
  return `Finance_Forecast_FY${fyShort}_${scen}_${stamp}`
}

const forecastHeaderStyle: Partial<ExcelJS.Style> = {
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

/**
 * Workbook: sheet "About" (metadata), sheet "Forecast" (tabular grid, AUD number format on amounts).
 */
export async function buildFinanceForecastWorkbook(
  dataset: FinanceForecastDataset,
  filters: FinanceForecastExportFilterState,
  apiMeta: FinanceForecastExportApiMeta | null | undefined,
  exportedAt: Date = new Date()
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Finance Forecast"

  const about = workbook.addWorksheet("About", {
    views: [{ state: "frozen", ySplit: 0 }],
  })
  about.getColumn(1).width = 28
  about.getColumn(2).width = 48

  let r = 1
  for (const [label, value] of buildMetadataPairs(dataset, filters, apiMeta, exportedAt)) {
    about.getCell(r, 1).value = label
    about.getCell(r, 1).font = { bold: true }
    about.getCell(r, 2).value = value
    r++
  }

  const ws = workbook.addWorksheet("Forecast")
  const fy = dataset.meta.financial_year_start_year
  const monthLabels = FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((k) => monthColumnLabel(k, fy))

  const headers = ["Section group", "Client", "Client ID", "Line", ...monthLabels, "FY total"]
  headers.forEach((h, i) => {
    const c = ws.getCell(1, i + 1)
    c.value = h
    c.style = forecastHeaderStyle as ExcelJS.Style
  })

  const data = buildFinanceForecastExportRows(dataset)
  const moneyFmt = '"$"#,##0.00'
  data.forEach((row, idx) => {
    const excelRow = idx + 2
    ws.getCell(excelRow, 1).value = row.section_group
    ws.getCell(excelRow, 2).value = row.client_name
    ws.getCell(excelRow, 3).value = row.client_id
    ws.getCell(excelRow, 4).value = row.line_label
    let col = 5
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      const cell = ws.getCell(excelRow, col)
      cell.value = row[k]
      cell.numFmt = moneyFmt
      col++
    }
    const totalCell = ws.getCell(excelRow, col)
    totalCell.value = row.fy_total
    totalCell.numFmt = moneyFmt
  })

  ws.getColumn(1).width = 36
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 42
  for (let c = 5; c <= 4 + FINANCE_FORECAST_FISCAL_MONTH_ORDER.length; c++) {
    ws.getColumn(c).width = 12
  }
  ws.getColumn(4 + FINANCE_FORECAST_FISCAL_MONTH_ORDER.length + 1).width = 14

  ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2", showGridLines: true }]

  return workbook
}
