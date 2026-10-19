import { dateInWindow, type DateWindow } from "@/lib/webReport/periods"

import { monthsInWindow } from "./progress"
import type { WebKpi, WebKpiActual, WebKpiMetric } from "./types"

/** One GA4 event's count on one day (V_GA4_EVENTS_DAILY, summed per date and name). */
export type KpiEventRow = { date: string; eventName: string; count: number }

/** One metric's value on one day, from V_GA4_CAMPAIGN_DAILY, V_GA4_LANDING_DAILY or V_GSC_SITE_DAILY. */
export type KpiMetricRow = { date: string; metric: WebKpiMetric; value: number }

export type KpiActualInputs = {
  kpis: readonly WebKpi[]
  window: DateWindow
  events: readonly KpiEventRow[]
  metrics: readonly KpiMetricRow[]
  /** False when the client has no account for that source, or the read failed. */
  ga4Readable: boolean
  gscReadable: boolean
}

function byMonth(daily: readonly { date: string; value: number }[], window: DateWindow): Omit<WebKpiActual, "kpiId"> {
  const months = monthsInWindow(window).map((item) => ({ month: item.month, actual: 0 }))
  const index = new Map(months.map((item) => [item.month, item]))
  let total = 0
  for (const row of daily) {
    if (!dateInWindow(row.date, window)) continue
    const bucket = index.get(`${row.date.slice(0, 7)}-01`)
    if (!bucket) continue
    bucket.actual += row.value
    total += row.value
  }
  return { total, months }
}

/** Actuals for the active KPIs only. ga4_event sums every listed event name. */
export function computeKpiActuals(input: KpiActualInputs): WebKpiActual[] {
  const out: WebKpiActual[] = []
  for (const kpi of input.kpis) {
    if (!kpi.active) continue
    const readable = kpi.source === "gsc_metric" ? input.gscReadable : input.ga4Readable
    if (!readable) {
      out.push({
        kpiId: kpi.id,
        total: null,
        months: monthsInWindow(input.window).map((item) => ({ month: item.month, actual: 0 })),
      })
      continue
    }
    let daily: { date: string; value: number }[]
    if (kpi.source === "ga4_event") {
      const names = new Set(kpi.eventNames ?? [])
      daily = input.events
        .filter((row) => names.has(row.eventName))
        .map((row) => ({ date: row.date, value: row.count }))
    } else {
      daily = input.metrics
        .filter((row) => row.metric === kpi.metric)
        .map((row) => ({ date: row.date, value: row.value }))
    }
    out.push({ kpiId: kpi.id, ...byMonth(daily, input.window) })
  }
  return out
}
