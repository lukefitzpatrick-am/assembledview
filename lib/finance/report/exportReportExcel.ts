import type ExcelJS from "exceljs"
import type { ReportDimension } from "./types"
import type { SubtotalNode } from "./groupAndSubtotal"

const currencyFmt = '"$"#,##0.00'
const workbookMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const titleFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEAF4F8" },
}

const headerFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
}

const subtotalFills: ExcelJS.Fill[] = [
  { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1F8" } },
  { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F6FA" } },
  { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } },
]

function styleCell(
  cell: ExcelJS.Cell,
  options: Partial<{
    value: ExcelJS.CellValue
    bold: boolean
    fontSize: number
    align: "left" | "right" | "center"
    fill: ExcelJS.Fill
    numFmt: string
    indent: number
  }>
) {
  if (options.value !== undefined) cell.value = options.value
  cell.font = {
    name: "Aptos",
    size: options.fontSize ?? 11,
    bold: options.bold ?? false,
  }
  cell.alignment = {
    horizontal: options.align ?? "left",
    vertical: "middle",
    indent: options.indent,
  }
  if (options.fill) cell.fill = options.fill
  if (options.numFmt) cell.numFmt = options.numFmt
}

function styleMeasureCells(
  sheet: ExcelJS.Worksheet,
  row: number,
  measures: SubtotalNode["measures"],
  options: { bold?: boolean; fill?: ExcelJS.Fill; fontSize?: number } = {}
) {
  const values = [measures.totalBillable, measures.mediaSpend, measures.agencyFee]
  values.forEach((value, index) => {
    styleCell(sheet.getCell(row, 3 + index), {
      value,
      align: "right",
      bold: options.bold,
      fill: options.fill,
      fontSize: options.fontSize,
      numFmt: currencyFmt,
    })
  })
}

function writeGroupRows(sheet: ExcelJS.Worksheet, node: SubtotalNode, depth: number, row: number): number {
  const fill = subtotalFills[Math.min(depth, subtotalFills.length - 1)]
  styleCell(sheet.getCell(row, 1), {
    value: node.key,
    bold: true,
    fill,
    indent: depth,
  })
  styleCell(sheet.getCell(row, 2), {
    value: node.dimension ?? "",
    bold: true,
    fill,
  })
  styleMeasureCells(sheet, row, node.measures, { bold: true, fill })

  let nextRow = row + 1
  for (const child of node.children) {
    nextRow = writeGroupRows(sheet, child, depth + 1, nextRow)
  }
  return nextRow
}

export type ReportExcelMeta = {
  filterLabel?: string
}

export async function exportReportExcel(
  root: SubtotalNode,
  order: ReportDimension[],
  meta: ReportExcelMeta = {}
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Report", {
    views: [{ state: "normal", showGridLines: false }],
  })

  sheet.columns = [
    { width: 34 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ]

  sheet.mergeCells(1, 1, 1, 5)
  styleCell(sheet.getCell(1, 1), {
    value: "Finance subtotal report",
    bold: true,
    fontSize: 18,
    fill: titleFill,
  })

  styleCell(sheet.getCell(3, 1), { value: "Group by", bold: true, align: "right" })
  styleCell(sheet.getCell(3, 2), {
    value: order.length > 0 ? order.join(" → ") : "None",
    fill: headerFill,
  })
  styleCell(sheet.getCell(4, 1), { value: "Filter scope", bold: true, align: "right" })
  styleCell(sheet.getCell(4, 2), { value: meta.filterLabel ?? "Current finance hub filters", fill: headerFill })

  const headerRow = 6
  ;["Group", "Dimension", "Total billable", "Media spend", "Agency fee"].forEach((label, index) => {
    styleCell(sheet.getCell(headerRow, index + 1), {
      value: label,
      bold: true,
      align: index >= 2 ? "right" : "left",
      fill: headerFill,
    })
  })

  let row = headerRow + 1
  for (const child of root.children) {
    row = writeGroupRows(sheet, child, 0, row)
  }

  row += 1
  styleCell(sheet.getCell(row, 1), {
    value: "Grand total",
    bold: true,
    fontSize: 12,
    fill: headerFill,
  })
  styleCell(sheet.getCell(row, 2), {
    value: "",
    bold: true,
    fontSize: 12,
    fill: headerFill,
  })
  styleMeasureCells(sheet, row, root.measures, { bold: true, fill: headerFill, fontSize: 12 })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: workbookMimeType })
}
