import type { ReportDimension, ReportRow } from "./types"

export interface SubtotalNode {
  dimension: ReportDimension | null
  key: string
  measures: { totalBillable: number; mediaSpend: number; agencyFee: number }
  children: SubtotalNode[]
  rowCount: number
}

const GRAND_TOTAL = "Grand Total"
const UNSPECIFIED = "Unspecified"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function emptyMeasures(): SubtotalNode["measures"] {
  return { totalBillable: 0, mediaSpend: 0, agencyFee: 0 }
}

function addMeasures(
  measures: SubtotalNode["measures"],
  row: Pick<ReportRow, "totalBillable" | "mediaSpend" | "agencyFee">
): void {
  measures.totalBillable = round2(measures.totalBillable + row.totalBillable)
  measures.mediaSpend = round2(measures.mediaSpend + row.mediaSpend)
  measures.agencyFee = round2(measures.agencyFee + row.agencyFee)
}

function compareKeys(a: string, b: string): number {
  if (a === UNSPECIFIED && b !== UNSPECIFIED) return 1
  if (b === UNSPECIFIED && a !== UNSPECIFIED) return -1
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

function dimensionKey(row: ReportRow, dimension: ReportDimension): string {
  const value =
    dimension === "mediaType"
      ? row.mediaType
      : dimension === "publisher"
        ? row.publisher
        : dimension === "buyType"
          ? row.buyType
          : dimension === "format"
            ? row.format
            : dimension === "station"
              ? row.station
              : dimension === "client"
                ? row.client
                : row.billingMonth
  return value.trim() || UNSPECIFIED
}

function buildNode(
  rows: ReportRow[],
  order: ReportDimension[],
  depth: number,
  dimension: ReportDimension | null,
  key: string
): SubtotalNode {
  const measures = emptyMeasures()
  for (const row of rows) {
    addMeasures(measures, row)
  }

  if (depth >= order.length) {
    return {
      dimension,
      key,
      measures,
      children: [],
      rowCount: rows.length,
    }
  }

  const childDimension = order[depth]!
  const grouped = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const childKey = dimensionKey(row, childDimension)
    const existing = grouped.get(childKey)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(childKey, [row])
    }
  }

  const children = [...grouped.entries()]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([childKey, childRows]) =>
      buildNode(childRows, order, depth + 1, childDimension, childKey)
    )

  return {
    dimension,
    key,
    measures,
    children,
    rowCount: rows.length,
  }
}

export function groupAndSubtotal(rows: ReportRow[], order: ReportDimension[]): SubtotalNode {
  return buildNode(rows, order, 0, null, GRAND_TOTAL)
}
