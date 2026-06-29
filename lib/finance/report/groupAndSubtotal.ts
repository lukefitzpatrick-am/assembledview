import type { ReportDimension, ReportRow } from "./types"

export interface SubtotalNode {
  dimension: ReportDimension | null
  key: string
  measures: { totalBillable: number; mediaSpend: number; agencyFee: number }
  children: SubtotalNode[]
  leafRows: ReportRow[]
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

function detailSortLabel(row: ReportRow): string {
  if (row.rowKind === "service") {
    if (row.serviceType === "adServing") return "Ad Serving"
    if (row.serviceType === "production") return "Production"
    return row.mediaType
  }
  return row.publisher
}

function detailSortRank(row: ReportRow): number {
  if (row.rowKind === "service") return 2
  return detailSortLabel(row) === UNSPECIFIED ? 1 : 0
}

function compareDetailRows(a: ReportRow, b: ReportRow): number {
  const rankDelta = detailSortRank(a) - detailSortRank(b)
  if (rankDelta !== 0) return rankDelta
  return compareKeys(detailSortLabel(a), detailSortLabel(b))
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
      leafRows: [...rows].sort(compareDetailRows),
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
    leafRows: [],
    rowCount: rows.length,
  }
}

export function groupAndSubtotal(rows: ReportRow[], order: ReportDimension[]): SubtotalNode {
  return buildNode(rows, order, 0, null, GRAND_TOTAL)
}
