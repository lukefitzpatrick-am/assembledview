export const WEB_KPI_SOURCES = ["ga4_event", "ga4_metric", "gsc_metric"] as const
export type WebKpiSource = (typeof WEB_KPI_SOURCES)[number]

export const GA4_KPI_METRICS = ["sessions", "engaged_sessions", "key_events", "page_views"] as const
export const GSC_KPI_METRICS = ["clicks", "impressions"] as const
export type Ga4KpiMetric = (typeof GA4_KPI_METRICS)[number]
export type GscKpiMetric = (typeof GSC_KPI_METRICS)[number]
export type WebKpiMetric = Ga4KpiMetric | GscKpiMetric

/** One month's target. month is the first of the month (YYYY-MM-01). */
export type WebKpiTarget = { month: string; target: number }

export type WebKpi = {
  id: string
  clientId: number
  label: string
  source: WebKpiSource
  /** Set only when source is ga4_event; at least one name. */
  eventNames: string[] | null
  /** Set only when source is ga4_metric or gsc_metric. */
  metric: WebKpiMetric | null
  active: boolean
  sortOrder: number
  targets: WebKpiTarget[]
}

export type WebKpiInput = {
  id?: string
  clientId: number
  label: string
  source: WebKpiSource
  eventNames?: string[] | null
  metric?: WebKpiMetric | null
  sortOrder?: number
}

/** A KPI's actual for a window and for each calendar month the window touches. */
export type WebKpiActual = {
  kpiId: string
  /** Null when the source is not connected or could not be read. */
  total: number | null
  months: { month: string; actual: number }[]
}

export type CleanKpiInput = {
  id?: string
  clientId: number
  label: string
  source: WebKpiSource
  eventNames: string[] | null
  metric: WebKpiMetric | null
  sortOrder: number
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value)
}

/** Mirrors the 0101 check constraints, so a bad row fails here and not in Postgres. */
export function validateKpiInput(input: WebKpiInput): CleanKpiInput {
  const label = input.label.trim()
  if (!label) throw new Error("KPI label is required")
  if (!Number.isInteger(input.clientId) || input.clientId <= 0) throw new Error("KPI client is required")
  if (!isOneOf(WEB_KPI_SOURCES, input.source)) throw new Error(`Unknown KPI source ${String(input.source)}`)
  const sortOrder = input.sortOrder ?? 0
  if (!Number.isInteger(sortOrder)) throw new Error("KPI sort order must be a whole number")
  const base = { id: input.id, clientId: input.clientId, label, source: input.source, sortOrder }
  if (input.source === "ga4_event") {
    const names = [...new Set((input.eventNames ?? []).map((name) => name.trim()).filter(Boolean))]
    if (names.length === 0) throw new Error("A GA4 event KPI needs at least one event name")
    return { ...base, eventNames: names, metric: null }
  }
  const allowed = input.source === "ga4_metric" ? GA4_KPI_METRICS : GSC_KPI_METRICS
  if (!isOneOf<WebKpiMetric>(allowed, input.metric)) {
    throw new Error(`Metric ${String(input.metric)} is not allowed for ${input.source}`)
  }
  return { ...base, eventNames: null, metric: input.metric }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/

export function validateTargets(targets: WebKpiTarget[]): WebKpiTarget[] {
  const seen = new Set<string>()
  for (const item of targets) {
    if (!MONTH.test(item.month)) throw new Error(`Target month ${item.month} must be the first of a month`)
    if (!Number.isFinite(item.target) || item.target < 0) throw new Error(`Target for ${item.month} must be 0 or more`)
    if (seen.has(item.month)) throw new Error(`Target month ${item.month} is listed twice`)
    seen.add(item.month)
  }
  return targets
}
