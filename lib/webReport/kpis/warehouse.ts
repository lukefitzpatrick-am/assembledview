import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import type { DateWindow } from "@/lib/webReport/periods"
import { dateOnly, field, isMissingMartView, num, text } from "@/lib/webReport/rows"
import type { WarehouseQuery } from "@/lib/webReport/types"

import { computeKpiActuals, type KpiEventRow, type KpiMetricRow } from "./actuals"
import { currentMonthWindow, kpiEditorRows, type KpiEditorRow } from "./editor"
import { buildKpiReportItems, trackerMonthList, trackerWindow, type WebKpiReport } from "./report"
import { listKpis, migration0101Applied } from "./repo"
import type { WebKpi, WebKpiActual } from "./types"

const GA4_SESSIONS_SQL = `
SELECT date, SUM(sessions) AS sessions, SUM(engaged_sessions) AS engaged_sessions, SUM(key_events) AS key_events
FROM ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
GROUP BY date
`

const GA4_PAGE_VIEWS_SQL = `
SELECT date, SUM(screen_page_views) AS page_views
FROM ASSEMBLEDVIEW.MART.V_GA4_LANDING_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
GROUP BY date
`

const GSC_SQL = `
SELECT date, SUM(clicks) AS clicks, SUM(impressions) AS impressions
FROM ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY
WHERE site = ?
  AND date BETWEEN ? AND ?
GROUP BY date
`

const EVENT_NAMES_SQL = `
SELECT event_name, SUM(event_count) AS event_count
FROM ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY
WHERE property_id = ?
  AND date >= DATEADD(day, -90, CURRENT_DATE())
  AND event_name IS NOT NULL
GROUP BY event_name
ORDER BY event_count DESC, event_name
LIMIT 500
`

function eventsSql(nameCount: number): string {
  const placeholders = Array.from({ length: nameCount }, () => "?").join(", ")
  return `
SELECT date, event_name, SUM(event_count) AS event_count
FROM ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
  AND event_name IN (${placeholders})
GROUP BY date, event_name
`
}

function metricRows(rows: Record<string, unknown>[], metrics: readonly KpiMetricRow["metric"][]): KpiMetricRow[] {
  const out: KpiMetricRow[] = []
  for (const row of rows) {
    const date = dateOnly(field(row, "date"))
    if (!date) continue
    for (const metric of metrics) {
      out.push({ date, metric, value: num(field(row, metric)) ?? 0 })
    }
  }
  return out
}

function eventRows(rows: Record<string, unknown>[]): KpiEventRow[] {
  const out: KpiEventRow[] = []
  for (const row of rows) {
    const date = dateOnly(field(row, "date"))
    const eventName = text(field(row, "event_name"))
    if (!date || !eventName) continue
    out.push({ date, eventName, count: num(field(row, "event_count")) ?? 0 })
  }
  return out
}

/** loadPage imports the report loader, which imports this file, so the accounts read is loaded lazily. */
async function reportAccounts(clientId: number) {
  const { loadReportAccounts } = await import("@/lib/webReport/loadPage")
  return loadReportAccounts(clientId)
}

async function snowflakeQuery(sql: string, binds: unknown[]) {
  return (await querySnowflake<Record<string, unknown>>(sql, binds, { label: "web-kpis" })) ?? []
}

/** Reads only what the given KPIs need. Exported for tests with an injected query. */
export async function readKpiActuals(input: {
  kpis: readonly WebKpi[]
  window: DateWindow
  ga4PropertyId: string | null
  gscSite: string | null
  query?: WarehouseQuery
}): Promise<WebKpiActual[]> {
  const query = input.query ?? snowflakeQuery
  const active = input.kpis.filter((kpi) => kpi.active)
  const needs = (predicate: (kpi: WebKpi) => boolean) => active.some(predicate)
  const wantedEvents = [...new Set(active.flatMap((kpi) => (kpi.source === "ga4_event" ? kpi.eventNames ?? [] : [])))]
  const ga4Binds = [input.ga4PropertyId, input.window.from, input.window.to]
  const events: KpiEventRow[] = []
  const metrics: KpiMetricRow[] = []
  let ga4Readable = input.ga4PropertyId != null
  let gscReadable = input.gscSite != null

  if (ga4Readable) {
    try {
      const [eventResult, sessionResult, pageViewResult] = await Promise.all([
        wantedEvents.length > 0 ? query(eventsSql(wantedEvents.length), [...ga4Binds, ...wantedEvents]) : [],
        needs((kpi) => kpi.source === "ga4_metric" && kpi.metric !== "page_views")
          ? query(GA4_SESSIONS_SQL, ga4Binds)
          : [],
        needs((kpi) => kpi.metric === "page_views") ? query(GA4_PAGE_VIEWS_SQL, ga4Binds) : [],
      ])
      events.push(...eventRows(eventResult))
      metrics.push(...metricRows(sessionResult, ["sessions", "engaged_sessions", "key_events"]))
      metrics.push(...metricRows(pageViewResult, ["page_views"]))
    } catch (err) {
      ga4Readable = false
      if (isMissingMartView(err, "v_ga4_")) console.warn("[web-kpis] GA4 MART view is not available")
      else console.error("[web-kpis] GA4 read failed", err)
    }
  }

  if (gscReadable && needs((kpi) => kpi.source === "gsc_metric")) {
    try {
      metrics.push(...metricRows(await query(GSC_SQL, [input.gscSite, input.window.from, input.window.to]), ["clicks", "impressions"]))
    } catch (err) {
      gscReadable = false
      if (isMissingMartView(err, "v_gsc_")) console.warn("[web-kpis] Search Console MART view is not available")
      else console.error("[web-kpis] Search Console read failed", err)
    }
  }

  return computeKpiActuals({ kpis: active, window: input.window, events, metrics, ga4Readable, gscReadable })
}

/** Actuals for each active KPI over the window and each month in it. GA4 and Search Console come from client_platform_accounts. */
export async function kpiActuals(clientId: number, window: DateWindow): Promise<WebKpiActual[]> {
  const kpis = await listKpis(clientId)
  if (kpis.length === 0) return []
  const accounts = await reportAccounts(clientId)
  return readKpiActuals({ kpis, window, ga4PropertyId: accounts.ga4PropertyId, gscSite: accounts.gscSite })
}

/**
 * Active KPIs with actuals for the report window and for the tracker's 12
 * months. Fails soft: not_ready before 0101, unavailable when the read fails.
 */
export async function loadKpiReport(input: {
  clientId: number
  window: DateWindow
  today: string
  ga4PropertyId: string | null
  gscSite: string | null
  query?: WarehouseQuery
}): Promise<WebKpiReport> {
  const trackerMonths = trackerMonthList(input.window)
  const base = { today: input.today, trackerMonths }
  if (!(await migration0101Applied())) return { ...base, status: "not_ready", items: [] }
  try {
    const kpis = await listKpis(input.clientId)
    if (kpis.length === 0) return { ...base, status: "ok", items: [] }
    const accounts = { ga4PropertyId: input.ga4PropertyId, gscSite: input.gscSite, query: input.query }
    const [windowActuals, trackerActuals] = await Promise.all([
      readKpiActuals({ kpis, window: input.window, ...accounts }),
      readKpiActuals({ kpis, window: trackerWindow(input.window), ...accounts }),
    ])
    return { ...base, status: "ok", items: buildKpiReportItems(kpis, windowActuals, trackerActuals) }
  } catch (err) {
    console.error("[web-kpis] report KPIs unavailable", err)
    return { ...base, status: "unavailable", items: [] }
  }
}

/** The KPI editor's list (active and deactivated) with this month's numbers, and the event picker's names. */
export async function loadKpiEditor(clientId: number, today: string): Promise<{
  migrationApplied: boolean
  rows: KpiEditorRow[]
  eventNames: { name: string; count: number }[]
}> {
  if (!(await migration0101Applied())) return { migrationApplied: false, rows: [], eventNames: [] }
  const [kpis, accounts] = await Promise.all([listKpis(clientId, { includeInactive: true }), reportAccounts(clientId)])
  const [actuals, names] = await Promise.all([
    kpis.some((kpi) => kpi.active)
      ? readKpiActuals({
          kpis,
          window: currentMonthWindow(today),
          ga4PropertyId: accounts.ga4PropertyId,
          gscSite: accounts.gscSite,
        })
      : Promise.resolve([]),
    eventNamesForProperty(accounts.ga4PropertyId),
  ])
  return { migrationApplied: true, rows: kpiEditorRows(kpis, actuals, today), eventNames: names }
}

/** Distinct GA4 event names with their counts over the last 90 days, for the KPI editor. */
export async function eventNames(clientId: number): Promise<{ name: string; count: number }[]> {
  const { ga4PropertyId } = await reportAccounts(clientId)
  return eventNamesForProperty(ga4PropertyId)
}

async function eventNamesForProperty(ga4PropertyId: string | null): Promise<{ name: string; count: number }[]> {
  if (!ga4PropertyId) return []
  try {
    const rows = await snowflakeQuery(EVENT_NAMES_SQL, [ga4PropertyId])
    const out: { name: string; count: number }[] = []
    for (const row of rows) {
      const name = text(field(row, "event_name"))
      if (name) out.push({ name, count: num(field(row, "event_count")) ?? 0 })
    }
    return out
  } catch (err) {
    if (!isMissingMartView(err, "V_GA4_EVENTS_DAILY")) console.warn("[web-kpis] event name list failed", err)
    return []
  }
}
