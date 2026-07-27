import type { FinanceFilters, FinanceSavedReportConfig, HubSavedView } from "@/lib/types/financeBilling"
import { DEFAULT_REPORT_METRICS, isReportMetricKey } from "@/lib/finance/report/metrics"
import type { ReportDimension } from "@/lib/finance/report/types"
import type { ReportMetricKey } from "@/lib/finance/report/metrics"

/** Browser localStorage key for finance hub saved views (+ optional report configs). */
export const FINANCE_HUB_SAVED_VIEWS_KEY = "finance-hub-saved-views-v3"

const SAVED_VIEWS_CHANGED_EVENT = "finance-hub-saved-views-changed"

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

function normalizeHubSavedView(raw: unknown): HubSavedView | null {
  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null
  if (!candidate.filters || typeof candidate.filters !== "object") return null
  const report = normalizeSavedReportConfig(candidate.report)
  return {
    name: candidate.name.trim(),
    filters: candidate.filters as FinanceFilters,
    ...(report ? { report } : {}),
  }
}

export function readHubSavedViews(): HubSavedView[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(FINANCE_HUB_SAVED_VIEWS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      const view = normalizeHubSavedView(entry)
      return view ? [view] : []
    })
  } catch {
    return []
  }
}

export function writeHubSavedViews(views: HubSavedView[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(FINANCE_HUB_SAVED_VIEWS_KEY, JSON.stringify(views))
  window.dispatchEvent(new Event(SAVED_VIEWS_CHANGED_EVENT))
}

/** Upsert by name. Pass `report: null` to clear a report block; omit to preserve existing. */
export function upsertHubSavedView(args: {
  name: string
  filters: FinanceFilters
  report?: FinanceSavedReportConfig | null
}): HubSavedView {
  const name = args.name.trim()
  const prev = readHubSavedViews()
  const existing = prev.find((view) => view.name === name)
  const next: HubSavedView = {
    name,
    filters: args.filters,
  }
  if (args.report === null) {
    // intentionally omit report
  } else if (args.report) {
    next.report = args.report
  } else if (existing?.report) {
    next.report = existing.report
  }
  writeHubSavedViews([next, ...prev.filter((view) => view.name !== name)])
  return next
}

export function subscribeHubSavedViews(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = () => onChange()
  window.addEventListener(SAVED_VIEWS_CHANGED_EVENT, handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener(SAVED_VIEWS_CHANGED_EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}
