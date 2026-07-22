import { addGst, gstAmount } from "@/lib/finance/gst"
import type { ReportRow } from "./types"

export type ReportMetricKey =
  | "totalBillable"
  | "mediaSpend"
  | "agencyFee"
  | "gst"
  | "nettIncGst"
  | "rowCount"

export type ReportMetricKind = "currency" | "count"

export type ReportMetricDef = {
  key: ReportMetricKey
  label: string
  kind: ReportMetricKind
}

/** Catalog of selectable report metrics (order = chip / default presentation order). */
export const REPORT_METRICS: ReportMetricDef[] = [
  { key: "totalBillable", label: "Total billable", kind: "currency" },
  { key: "mediaSpend", label: "Media spend", kind: "currency" },
  { key: "agencyFee", label: "Agency fee", kind: "currency" },
  { key: "gst", label: "GST", kind: "currency" },
  { key: "nettIncGst", label: "Nett inc GST", kind: "currency" },
  { key: "rowCount", label: "Rows", kind: "count" },
]

/** Default selection — matches the historical fixed three currency columns. */
export const DEFAULT_REPORT_METRICS: ReportMetricKey[] = [
  "totalBillable",
  "mediaSpend",
  "agencyFee",
]

const REPORT_METRIC_KEYS = new Set<ReportMetricKey>(REPORT_METRICS.map((m) => m.key))

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Per-row currency extractors. Totals are ex-GST; GST/nett are derived via `lib/finance/gst.ts`.
 * `rowCount` is a node leaf count, not extracted per row field.
 */
export const CURRENCY_METRIC_EXTRACTORS: Record<
  Exclude<ReportMetricKey, "rowCount">,
  (row: ReportRow) => number
> = {
  totalBillable: (row) => row.totalBillable,
  mediaSpend: (row) => row.mediaSpend,
  agencyFee: (row) => row.agencyFee,
  gst: (row) => gstAmount(row.totalBillable),
  nettIncGst: (row) => addGst(row.totalBillable),
}

export function emptyReportMeasures(): Record<ReportMetricKey, number> {
  const measures = {} as Record<ReportMetricKey, number>
  for (const metric of REPORT_METRICS) {
    measures[metric.key] = 0
  }
  return measures
}

/** Accumulate additive measures from one detail row (GST is linear → sum-of-row-GST == GST-of-sum). */
export function addReportMeasures(
  measures: Record<ReportMetricKey, number>,
  row: ReportRow
): void {
  for (const metric of REPORT_METRICS) {
    if (metric.key === "rowCount") {
      measures.rowCount += 1
      continue
    }
    const extracted = CURRENCY_METRIC_EXTRACTORS[metric.key](row)
    measures[metric.key] = round2(measures[metric.key] + extracted)
  }
}

export function measuresFromReportRow(row: ReportRow): Record<ReportMetricKey, number> {
  const measures = emptyReportMeasures()
  addReportMeasures(measures, row)
  return measures
}

export function metricDef(key: ReportMetricKey): ReportMetricDef {
  return REPORT_METRICS.find((m) => m.key === key) ?? {
    key,
    label: key,
    kind: key === "rowCount" ? "count" : "currency",
  }
}

export function isReportMetricKey(value: unknown): value is ReportMetricKey {
  return typeof value === "string" && REPORT_METRIC_KEYS.has(value as ReportMetricKey)
}
