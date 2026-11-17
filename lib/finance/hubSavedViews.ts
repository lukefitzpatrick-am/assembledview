import type { FinanceSavedReportConfig } from "@/lib/types/financeBilling"
import { DEFAULT_REPORT_METRICS, isReportMetricKey } from "@/lib/finance/report/metrics"
import type { ReportDimension } from "@/lib/finance/report/types"
import type { ReportMetricKey } from "@/lib/finance/report/metrics"

/** Browser localStorage key for finance hub saved views (+ optional report configs). */
export const FINANCE_HUB_SAVED_VIEWS_KEY = "finance-hub-saved-views-v3"

const REPORT_DIMENSIONS = new Set<ReportDimension>([
  "mediaType",
  "publisher",
  "buyType",
  "format",
  "station",
  "client",
  "billingMonth",
  "financialYear",
  "mbaNumber",
  "billingType",
  "billingStatus",
  "rowKind",
  "clientPays",
  "billingAgency",
])

function isReportDimension(value: unknown): value is ReportDimension {
  return typeof value === "string" && REPORT_DIMENSIONS.has(value as ReportDimension)
}

/** Normalize an optional saved `report` block; returns undefined when absent/invalid. */
export function normalizeSavedReportConfig(raw: unknown): FinanceSavedReportConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const candidate = raw as Record<string, unknown>
  const groupBy = Array.isArray(candidate.groupBy)
    ? candidate.groupBy.filter(isReportDimension)
    : []
  const metricsRaw = Array.isArray(candidate.metrics)
    ? candidate.metrics.filter(isReportMetricKey)
    : []
  const metrics: ReportMetricKey[] =
    metricsRaw.length > 0 ? metricsRaw : [...DEFAULT_REPORT_METRICS]
  const showDetailRows = candidate.showDetailRows === true
  return { groupBy, metrics, showDetailRows }
}
