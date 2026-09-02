import ExcelJS from "exceljs"
import type { RmMetric } from "../royMorganTypes"

export async function workbookBuffer(
  build: (wb: ExcelJS.Workbook) => void
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  build(wb)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function writePreamble(
  ws: ExcelJS.Worksheet,
  opts?: {
    wave?: string
    survey?: string
    filter?: string
    weights?: string
  }
): void {
  ws.getCell(1, 1).value = opts?.wave ?? "MAR26E1_ASM"
  ws.getCell(2, 1).value = `Survey Period: ${opts?.survey ?? "Jan - Dec 2025"}`
  ws.getCell(3, 1).value = `Filter: ${opts?.filter ?? "All cases"}`
  ws.getCell(4, 1).value = `Weights: ${opts?.weights ?? "weighted"}`
}

export type FixtureDataRow = {
  label: string
  wc?: number | string | null
  reachPct?: number | string | null
  index?: number | string | null
  metricsEmpty?: boolean
}

export function writeBlock(
  ws: ExcelJS.Worksheet,
  opts: {
    labelCol: number
    firstMetricCol: number
    metricRow: number
    name: string
    unweighted?: number | null
    popn?: number | null
    metrics: RmMetric[]
    mergeNameAcross?: number
    rows: FixtureDataRow[]
  }
): void {
  const nameRow = opts.metricRow - 3
  const unweightedRow = opts.metricRow - 2
  const popnRow = opts.metricRow - 1
  const first = opts.firstMetricCol

  ws.getCell(nameRow, first).value = opts.name
  if (opts.mergeNameAcross && opts.mergeNameAcross > 1) {
    ws.mergeCells(nameRow, first, nameRow, first + opts.mergeNameAcross - 1)
  }

  ws.getCell(unweightedRow, opts.labelCol).value = "(unweighted)"
  if (opts.unweighted != null) {
    ws.getCell(unweightedRow, first).value = opts.unweighted
  }

  ws.getCell(popnRow, opts.labelCol).value = "(POPN '000)"
  if (opts.popn != null) {
    ws.getCell(popnRow, first).value = opts.popn
  }

  let col = first
  for (const m of opts.metrics) {
    ws.getCell(opts.metricRow, col).value = m
    col += 1
  }

  opts.rows.forEach((row, i) => {
    const r = opts.metricRow + 1 + i
    ws.getCell(r, opts.labelCol).value = row.label
    if (row.metricsEmpty) return
    let c = first
    for (const m of opts.metrics) {
      if (m === "wc" && row.wc !== undefined && row.wc !== null) {
        ws.getCell(r, c).value = row.wc
      }
      if (m === "v%" && row.reachPct !== undefined && row.reachPct !== null) {
        ws.getCell(r, c).value = row.reachPct
      }
      if (m === "ix" && row.index !== undefined && row.index !== null) {
        ws.getCell(r, c).value = row.index
      }
      c += 1
    }
  })
}

export const THREE_MEDIA: FixtureDataRow[] = [
  { label: "MEDIA", metricsEmpty: true },
  { label: "FTA TV", wc: 120, reachPct: 0.24, index: 110 },
  { label: "Radio", wc: 80, reachPct: 0.16, index: 95 },
  { label: "Cinema", wc: 15, reachPct: 0.03, index: 80 },
]
