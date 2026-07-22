import { australianFyStartYearForDate, fyDisplayLabel } from "@/lib/finance/months"
import {
  addReportMeasures,
  emptyReportMeasures,
  type ReportMetricKey,
} from "./metrics"
import type { ReportDimension, ReportRow } from "./types"

export interface SubtotalNode {
  dimension: ReportDimension | null
  key: string
  measures: Record<ReportMetricKey, number>
  children: SubtotalNode[]
  leafRows: ReportRow[]
  rowCount: number
}

const GRAND_TOTAL = "Grand Total"
const UNSPECIFIED = "Unspecified"

function financialYearKey(billingMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth.trim())
  if (!match) return UNSPECIFIED
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return UNSPECIFIED
  return fyDisplayLabel(australianFyStartYearForDate(new Date(year, month - 1, 1)))
}

function billingTypeKey(billingType: string): string {
  const trimmed = billingType.trim()
  if (!trimmed) return UNSPECIFIED
  const lower = trimmed.toLowerCase()
  if (lower === "sow") return "SOW"
  return lower.charAt(0).toUpperCase() + lower.slice(1)
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
  if (dimension === "financialYear") return financialYearKey(row.billingMonth)
  if (dimension === "mbaNumber") return row.mbaNumber.trim() || UNSPECIFIED
  if (dimension === "billingType") return billingTypeKey(row.billingType)
  if (dimension === "billingStatus") return row.billingStatus.trim() || UNSPECIFIED
  if (dimension === "rowKind") return row.rowKind === "service" ? "Service" : "Media"
  if (dimension === "clientPays") return row.clientPays ? "Client pays media" : "Agency billed"
  if (dimension === "billingAgency") {
    return row.billingAgency === "AA" ? "Advertising Associates" : "Assembled Media"
  }

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
  const measures = emptyReportMeasures()
  for (const row of rows) {
    addReportMeasures(measures, row)
  }
  // rowCount measure mirrors node.rowCount (leaf row count under this node).
  measures.rowCount = rows.length

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
