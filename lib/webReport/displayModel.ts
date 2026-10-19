import { formatMoneyCompact, formatPercent } from "@/lib/format/money"
import { elementViewState } from "@/lib/webReport/elementState"
import {
  WEB_REPORT_ELEMENTS,
  parseElementSettings,
  resolveDisplay,
  type WebDisplay,
  type WebElementId,
  type WebMetric,
  type WebReportLayoutItem,
  type WebWidth,
} from "@/lib/webReport/elements"
import type {
  CityRow,
  DailyPoint,
  PageRow,
  PeriodTotals,
  QueryRow,
  SearchPageRow,
  SourceMediumRow,
  WebReportData,
} from "@/lib/webReport/types"

const NUMBER = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })
const POSITION = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const CHART_SERIES = {
  one: "var(--av-chart-1)",
  two: "var(--av-chart-2)",
  three: "var(--av-chart-3)",
  ink: "var(--av-ink)",
} as const

export type SeriesSpec = { key: string; label: string; color: string }

export type PreparedTile = {
  label: string
  value: string | null
  caption?: string
  /** Raw numbers for a bullet. Target is absent when the tile has none. */
  current: number | null
  target?: number
  spark: { value: number }[]
}

export type PreparedTableCell = { text: string; shade?: number }

export type PreparedDisplay =
  | { kind: "message"; title: string; message: string }
  | { kind: "text"; title: string; text: string }
  | { kind: "tiles"; title: string; tiles: PreparedTile[]; withSpark: boolean }
  | { kind: "bullet"; title: string; rows: { label: string; measure: number; target: number }[]; plain: PreparedTile[] }
  | { kind: "series"; title: string; display: "combo" | "line" | "area" | "column"; data: Record<string, string | number>[]; bars: SeriesSpec[]; lines: SeriesSpec[]; hiddenByDefault?: string[] }
  | { kind: "calendar"; title: string; weeks: number; cells: { week: number; day: number; value: number }[] }
  | { kind: "table"; title: string; headers: string[]; rows: { key: string; cells: PreparedTableCell[] }[]; note?: string }
  | { kind: "ranked"; title: string; display: "bar" | "donut" | "treemap"; rows: { label: string; value: number }[]; valueLabel: string; note?: string }
  | { kind: "waterfall"; title: string; steps: { label: string; value: number }[] }
  | { kind: "bubble"; title: string; points: QueryBubblePoint[]; note: string }
  | { kind: "histogram"; title: string; buckets: PositionBucket[]; note: string }

/** x is position (plotted on a reversed axis so 1 is on the right), y is CTR in percent, z is impressions. */
export type QueryBubblePoint = {
  query: string
  brand: boolean
  x: number
  y: number
  z: number
  clicks: number
  impressions: number
}

export type PositionBucket = { bucket: string; queries: number; clicks: number }

const METRIC_LABEL: Record<WebMetric, string> = {
  users: "Users",
  newUsers: "New users",
  sessions: "Sessions",
  engagementRate: "Engagement rate",
  keyEvents: "Key events",
  pageViews: "Page views",
  clicks: "Clicks",
  impressions: "Impressions",
  ctr: "CTR",
  position: "Position",
  avSpend: "AV spend",
}

/** Phone is one column, so half and third become full width below the `md` breakpoint. */
export function columnSpanClass(width: WebWidth): string {
  if (width === 6) return "min-w-0 md:col-span-6"
  if (width === 4) return "min-w-0 md:col-span-4"
  return "min-w-0 md:col-span-12"
}

function formatMetric(metric: WebMetric, totals: PeriodTotals, paid: number | null): string {
  if (metric === "avSpend") return formatMoneyCompact(paid)
  if (metric === "newUsers") return "Not available yet"
  const value = totals[metric]
  if (value == null) return "—"
  if (metric === "engagementRate" || metric === "ctr") return formatPercent(value * 100)
  if (metric === "position") return POSITION.format(value)
  return NUMBER.format(value)
}

function metricNumber(metric: WebMetric, totals: PeriodTotals, paid: number | null): number | null {
  if (metric === "avSpend") return paid
  if (metric === "newUsers") return null
  return totals[metric]
}

function gscMetric(metric: WebMetric): boolean {
  return metric === "clicks" || metric === "impressions" || metric === "ctr" || metric === "position"
}

function dailyValue(metric: WebMetric, point: DailyPoint): number | null {
  if (metric === "sessions") return point.sessions
  if (metric === "pageViews") return point.pageViews
  if (metric === "keyEvents") return point.keyEvents
  if (metric === "clicks") return point.clicks
  if (metric === "impressions") return point.impressions
  return null
}

function sparkFor(metric: WebMetric, data: WebReportData): { value: number }[] {
  const series = gscMetric(metric) ? data.gsc.daily : data.ga4.daily
  const points = series.flatMap((point) => {
    const value = dailyValue(metric, point)
    return value == null ? [] : [{ value }]
  })
  return points
}

function tileForMetric(metric: WebMetric, data: WebReportData, target?: number): PreparedTile {
  const totals = gscMetric(metric) ? data.gsc.current : data.ga4.current
  const paid = metric === "avSpend" ? data.paid.spend : null
  const caption = metric === "users" ? "Users (sum of daily)" : metric === "newUsers" ? "Not available yet" : undefined
  return {
    label: METRIC_LABEL[metric],
    value: metric === "newUsers" ? null : formatMetric(metric, totals, paid),
    caption,
    current: metricNumber(metric, totals, paid),
    target,
    spark: sparkFor(metric, data),
  }
}

type KpiSetting = { kind: string; metric?: WebMetric; eventName?: string; target?: number }

function kpiTiles(tiles: KpiSetting[], data: WebReportData): PreparedTile[] {
  return tiles.map((tile) => {
    if (tile.kind === "keyEvent") {
      const named = data.ga4.keyEventsByName.find((row) => row.name === tile.eventName)
      return {
        label: tile.eventName ?? "Key event",
        value: NUMBER.format(named?.count ?? 0),
        current: named?.count ?? 0,
        target: tile.target,
        spark: [],
      }
    }
    return tileForMetric(tile.metric ?? "sessions", data, tile.target)
  })
}

function hasSpark(tiles: PreparedTile[]): boolean {
  return tiles.some((tile) => tile.spark.length > 0)
}

function bulletRows(tiles: PreparedTile[]): { label: string; measure: number; target: number }[] {
  return tiles.flatMap((tile) => {
    if (tile.target == null || tile.current == null) return []
    const top = Math.max(tile.current, tile.target, 1)
    return [{ label: tile.label, measure: (tile.current / top) * 100, target: (tile.target / top) * 100 }]
  })
}

function ga4Series(data: WebReportData): Record<string, string | number>[] {
  return data.ga4.daily.map((point) => ({
    date: point.date,
    sessions: point.sessions ?? 0,
    pageViews: point.pageViews ?? 0,
    keyEvents: point.keyEvents ?? 0,
  }))
}

function seriesSpecs(bars: ("pageViews" | "sessions")[]): { bars: SeriesSpec[]; lines: SeriesSpec[] } {
  return {
    bars: bars.map((key) => ({
      key,
      label: key === "pageViews" ? "Page views" : "Sessions",
      color: key === "pageViews" ? CHART_SERIES.two : CHART_SERIES.one,
    })),
    lines: [{ key: "keyEvents", label: "Key events", color: CHART_SERIES.ink }],
  }
}

function hasGa4Daily(data: WebReportData): boolean {
  return data.ga4.daily.some((point) => point.sessions != null || point.pageViews != null || point.keyEvents != null)
}

export function calendarFromDaily(points: { date: string; value: number }[]): { weeks: number; cells: { week: number; day: number; value: number }[] } {
  if (points.length === 0) return { weeks: 1, cells: [] }
  const max = points.reduce((top, point) => Math.max(top, point.value), 0)
  const start = Date.parse(`${points[0].date}T00:00:00Z`)
  const startDay = new Date(start).getUTCDay()
  const mondayOffset = (startDay + 6) % 7
  const origin = start - mondayOffset * 86_400_000
  let weeks = 1
  const cells = points.map((point) => {
    const at = Date.parse(`${point.date}T00:00:00Z`)
    const diff = Math.round((at - origin) / 86_400_000)
    const week = Math.floor(diff / 7)
    const day = ((diff % 7) + 7) % 7
    weeks = Math.max(weeks, week + 1)
    return { week, day, value: max > 0 ? point.value / max : 0 }
  })
  return { weeks, cells }
}

function rankedPair(label: string, value: number): { label: string; value: number } {
  return { label, value }
}

function pageRows(rows: PageRow[], topN: number, value: "pageViews"): { label: string; value: number }[] {
  return rows.slice(0, topN).map((row) => rankedPair(row.page, row[value]))
}

function sourceLabel(row: SourceMediumRow): string {
  return `${row.source} / ${row.medium}`
}

export function donutSlices(rows: SourceMediumRow[], topN: number): { label: string; value: number }[] {
  return rows.slice(0, topN).flatMap((row) => (row.sessions > 0 ? [rankedPair(sourceLabel(row), row.sessions)] : []))
}

export function waterfallSteps(rows: SourceMediumRow[]): { label: string; value: number }[] | null {
  if (rows.length === 0) return []
  if (rows.some((row) => row.previousSessions == null)) return null
  const deltas = rows.map((row) => ({
    label: sourceLabel(row),
    value: row.sessions - (row.previousSessions ?? 0),
  }))
  const sorted = deltas.toSorted((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label))
  const top = sorted.slice(0, 5).map((row) => ({ label: row.label, value: row.value }))
  const rest = sorted.slice(5)
  if (rest.length > 0) {
    top.push({ label: "Other", value: rest.reduce((sum, row) => sum + row.value, 0) })
  }
  return top
}

function shade(share: number, on: boolean): number | undefined {
  if (!on || !Number.isFinite(share) || share <= 0) return undefined
  return share
}

function sourceTable(rows: SourceMediumRow[], columns: ("sessions" | "keyEvents" | "engagementRate")[], shadeOn: boolean) {
  const totals = {
    sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
    keyEvents: rows.reduce((sum, row) => sum + row.keyEvents, 0),
  }
  const headers = [
    "Source / medium",
    ...columns.map((column) => (column === "keyEvents" ? "Key events" : column === "engagementRate" ? "Engagement rate" : "Sessions")),
  ]
  return {
    headers,
    rows: rows.map((row) => ({
      key: sourceLabel(row),
      cells: [
        { text: sourceLabel(row) },
        ...columns.map((column) => {
          const share = column === "sessions"
            ? row.sessions / (totals.sessions || 1)
            : column === "keyEvents"
              ? row.keyEvents / (totals.keyEvents || 1)
              : 0
          const text = column === "engagementRate"
            ? row.engagementRate == null ? "—" : formatPercent(row.engagementRate * 100)
            : NUMBER.format(column === "sessions" ? row.sessions : row.keyEvents)
          return { text, shade: shade(share, shadeOn) }
        }),
      ],
    })),
  }
}

function searchTable(heading: string, rows: { key: string; label: string; clicks: number; impressions: number; ctr: number | null; position: number | null }[]) {
  return {
    headers: [heading, "Clicks", "Impressions", "CTR", "Position"],
    rows: rows.map((row) => ({
      key: row.key,
      cells: [
        { text: row.label },
        { text: NUMBER.format(row.clicks) },
        { text: NUMBER.format(row.impressions) },
        { text: row.ctr == null ? "—" : formatPercent(row.ctr * 100) },
        { text: row.position == null ? "—" : POSITION.format(row.position) },
      ],
    })),
    note: "Position is the impression-weighted average for the period.",
  }
}

function queryRows(rows: QueryRow[], mode: "all" | "brand" | "non_brand", topN: number) {
  return rows
    .filter((row) => mode === "all" || (mode === "brand" ? row.brand : !row.brand))
    .slice(0, topN)
    .map((row) => ({
      key: row.query,
      label: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
}

function searchPageRows(rows: SearchPageRow[], topN: number) {
  return rows.slice(0, topN).map((row) => ({
    key: row.page,
    label: row.page,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }))
}

export const QUERY_BUBBLE_LIMIT = 30

/** Top queries by impressions. Position is the impression-weighted average the reader already returns. */
export function queryBubblePoints(rows: QueryRow[], limit = QUERY_BUBBLE_LIMIT): QueryBubblePoint[] {
  return rows
    .filter((row) => row.position != null && row.impressions > 0)
    .toSorted((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
    .slice(0, limit)
    .map((row) => ({
      query: row.query,
      brand: row.brand,
      x: row.position as number,
      y: (row.ctr ?? row.clicks / row.impressions) * 100,
      z: row.impressions,
      clicks: row.clicks,
      impressions: row.impressions,
    }))
}

const POSITION_BUCKETS: { bucket: string; max: number }[] = [
  { bucket: "1-3", max: 3 },
  { bucket: "4-10", max: 10 },
  { bucket: "11-20", max: 20 },
  { bucket: "21-50", max: 50 },
  { bucket: "51+", max: Number.POSITIVE_INFINITY },
]

/** Buckets use strict cut-offs on the unrounded average position: 3.4 is in 4-10, 10.0 is in 4-10. */
export function positionBuckets(rows: QueryRow[]): PositionBucket[] {
  const buckets = POSITION_BUCKETS.map((item) => ({ bucket: item.bucket, queries: 0, clicks: 0 }))
  for (const row of rows) {
    if (row.position == null || !Number.isFinite(row.position)) continue
    const position = row.position
    const index = POSITION_BUCKETS.findIndex((item) => position <= item.max)
    buckets[index].queries += 1
    buckets[index].clicks += row.clicks
  }
  return buckets
}

function gscSeries(data: WebReportData): Record<string, string | number>[] {
  return data.gsc.daily.map((point) => ({
    date: point.date,
    clicks: point.clicks ?? 0,
    impressions: point.impressions ?? 0,
  }))
}

const GSC_CLICKS: SeriesSpec = { key: "clicks", label: "Clicks", color: CHART_SERIES.one }
const GSC_IMPRESSIONS: SeriesSpec = { key: "impressions", label: "Impressions", color: CHART_SERIES.two }

function cityTable(rows: CityRow[], topN: number) {
  const unset = rows.find((row) => row.city === "(not set)")
  const ranked = rows.filter((row) => row.city !== "(not set)").slice(0, topN)
  const shown = unset ? [...ranked, unset] : ranked
  return {
    headers: ["City", "Engaged sessions", "New users", "Key events", "Key event rate"],
    rows: shown.map((row) => ({
      key: row.city,
      cells: [
        { text: row.city },
        { text: NUMBER.format(row.engagedSessions) },
        { text: NUMBER.format(row.newUsers) },
        { text: NUMBER.format(row.keyEvents) },
        { text: row.keyEventRate == null ? "—" : formatPercent(row.keyEventRate * 100) },
      ],
    })),
    note: "(not set) stays at the bottom when Google Analytics 4 has no city.",
  }
}

function pageTable(rows: PageRow[], topN: number, heading: string) {
  return {
    headers: [heading, "Page views", "Users", "Key events"],
    rows: rows.slice(0, topN).map((row) => ({
      key: row.page,
      cells: [
        { text: row.page },
        { text: NUMBER.format(row.pageViews) },
        { text: NUMBER.format(row.users) },
        { text: NUMBER.format(row.keyEvents) },
      ],
    })),
  }
}

function displayReady(display: WebDisplay, item: WebReportLayoutItem, data: WebReportData): boolean {
  if (display === "spark") {
    const prepared = buildBody(item, data, "tiles")
    return prepared.kind === "tiles" && hasSpark(prepared.tiles)
  }
  if (display === "bullet") {
    const prepared = buildBody(item, data, "tiles")
    return prepared.kind === "tiles" && bulletRows(prepared.tiles).length > 0
  }
  if (display === "waterfall") {
    return waterfallSteps(data.ga4.sourceMedium) != null && (waterfallSteps(data.ga4.sourceMedium)?.length ?? 0) > 0
  }
  if (display === "calendar" || display === "combo" || display === "line" || display === "area" || display === "column") {
    if (item.elementId === "gscTrend" || item.elementId === "gscKpi") {
      return data.gsc.daily.some((point) => point.clicks != null || point.impressions != null)
    }
    return hasGa4Daily(data)
  }
  return true
}

export function renderableDisplay(item: WebReportLayoutItem, data: WebReportData): WebDisplay {
  const chosen = resolveDisplay(item)
  if (displayReady(chosen, item, data)) return chosen
  return WEB_REPORT_ELEMENTS[item.elementId].displays[0]
}

function emptyMessage(title: string): PreparedDisplay {
  return { kind: "message", title, message: "No rows in this period." }
}

function buildBody(item: WebReportLayoutItem, data: WebReportData, display: WebDisplay): PreparedDisplay {
  const title = WEB_REPORT_ELEMENTS[item.elementId].title
  const id = item.elementId
  const parsed = parseElementSettings(id, item.settings)
  if (!parsed.ok) return { kind: "message", title, message: "This element is not set up yet." }
  const settings = parsed.settings

  if (display === "text" || id === "notes") {
    return { kind: "text", title, text: (settings as { text?: string }).text ?? "" }
  }

  if (display === "tiles" || display === "spark") {
    const tiles = tilesFor(id, settings, data)
    return { kind: "tiles", title, tiles, withSpark: display === "spark" && hasSpark(tiles) }
  }

  if (display === "bullet") {
    const tiles = tilesFor(id, settings, data)
    const rows = bulletRows(tiles)
    return {
      kind: "bullet",
      title,
      rows,
      plain: tiles.filter((tile) => tile.target == null),
    }
  }

  if (id === "traffic" && (display === "combo" || display === "line" || display === "area" || display === "column")) {
    if (!hasGa4Daily(data)) return emptyMessage(title)
    const bars = (settings as { bars: ("pageViews" | "sessions")[] }).bars
    const spec = seriesSpecs(bars)
    const chartBars = display === "line" || display === "area" ? [] : spec.bars
    const chartLines = display === "column" ? [] : display === "combo" ? spec.lines : [...spec.bars, ...spec.lines]
    return { kind: "series", title, display, data: ga4Series(data), bars: chartBars, lines: chartLines }
  }

  if (id === "traffic" && display === "calendar") {
    const points = data.ga4.daily.flatMap((point) => (point.sessions == null ? [] : [{ date: point.date, value: point.sessions }]))
    if (points.length === 0) return emptyMessage(title)
    const calendar = calendarFromDaily(points)
    return { kind: "calendar", title, ...calendar }
  }

  if (id === "gscTrend") {
    const hasDaily = data.gsc.daily.some((point) => point.clicks != null || point.impressions != null)
    if (!hasDaily) return emptyMessage(title)
    if (display === "calendar") {
      const points = data.gsc.daily.flatMap((point) => (point.clicks == null ? [] : [{ date: point.date, value: point.clicks }]))
      if (points.length === 0) return emptyMessage(title)
      return { kind: "calendar", title, ...calendarFromDaily(points) }
    }
    if (display === "combo") {
      return { kind: "series", title, display, data: gscSeries(data), bars: [GSC_IMPRESSIONS], lines: [GSC_CLICKS] }
    }
    const chart = display === "area" ? "area" : "line"
    return {
      kind: "series",
      title,
      display: chart,
      data: gscSeries(data),
      bars: [],
      lines: [GSC_CLICKS, GSC_IMPRESSIONS],
      hiddenByDefault: [GSC_IMPRESSIONS.key],
    }
  }

  if (id === "queryBubble") {
    const points = queryBubblePoints(data.gsc.queries)
    if (points.length === 0) return emptyMessage(title)
    return {
      kind: "bubble",
      title,
      points,
      note: `Top ${QUERY_BUBBLE_LIMIT} queries by impressions. Bubble size is impressions. Position is the impression-weighted average.`,
    }
  }

  if (id === "queryPositions") {
    const buckets = positionBuckets(data.gsc.queries)
    if (buckets.every((bucket) => bucket.queries === 0)) return emptyMessage(title)
    return {
      kind: "histogram",
      title,
      buckets,
      note: "Queries by impression-weighted average position.",
    }
  }

  if (id === "srcmed") {
    const spec = settings as { topN: number; columns: ("sessions" | "keyEvents" | "engagementRate")[]; shade: boolean }
    const rows = data.ga4.sourceMedium.slice(0, spec.topN)
    if (rows.length === 0) return emptyMessage(title)
    if (display === "table") {
      return { kind: "table", title, ...sourceTable(rows, spec.columns, spec.shade) }
    }
    if (display === "donut") {
      return {
        kind: "ranked",
        title,
        display: "donut",
        rows: donutSlices(rows, rows.length),
        valueLabel: "Sessions",
        note: "Share of sessions. Users are not included.",
      }
    }
    if (display === "treemap" || display === "bar") {
      return {
        kind: "ranked",
        title,
        display,
        rows: rows.map((row) => rankedPair(sourceLabel(row), row.sessions)),
        valueLabel: "Sessions",
      }
    }
    const steps = waterfallSteps(rows)
    if (!steps || steps.length === 0) return emptyMessage(title)
    return { kind: "waterfall", title, steps }
  }

  if (id === "pages" || id === "landing") {
    const topN = (settings as { topN: number }).topN
    const source = id === "pages" ? data.ga4.pages : data.ga4.landing
    const heading = id === "pages" ? "Page title" : "Page path"
    if (source.length === 0) return emptyMessage(title)
    if (display === "table") return { kind: "table", title, ...pageTable(source, topN, heading) }
    return {
      kind: "ranked",
      title,
      display: display === "treemap" ? "treemap" : "bar",
      rows: pageRows(source, topN, "pageViews"),
      valueLabel: "Page views",
    }
  }

  if (id === "location") {
    const topN = (settings as { topN: number }).topN
    if (data.ga4.cities.length === 0) return emptyMessage(title)
    if (display === "bar") {
      const unset = data.ga4.cities.find((row) => row.city === "(not set)")
      const ranked = data.ga4.cities.filter((row) => row.city !== "(not set)").slice(0, topN)
      const shown = unset ? [...ranked, unset] : ranked
      return {
        kind: "ranked",
        title,
        display: "bar",
        rows: shown.map((row) => rankedPair(row.city, row.engagedSessions)),
        valueLabel: "Engaged sessions",
        note: "(not set) stays at the bottom when Google Analytics 4 has no city.",
      }
    }
    return { kind: "table", title, ...cityTable(data.ga4.cities, topN) }
  }

  if (id === "queries") {
    const spec = settings as { mode: "all" | "brand" | "non_brand"; topN: number }
    const rows = queryRows(data.gsc.queries, spec.mode, spec.topN)
    if (rows.length === 0) return emptyMessage(title)
    if (display === "bar") {
      return {
        kind: "ranked",
        title,
        display: "bar",
        rows: rows.map((row) => rankedPair(row.label, row.clicks)),
        valueLabel: "Clicks",
        note: "Position is the impression-weighted average for the period.",
      }
    }
    return { kind: "table", title, ...searchTable("Query", rows) }
  }

  if (id === "gscPages") {
    const topN = (settings as { topN: number }).topN
    const rows = searchPageRows(data.gsc.pages, topN)
    if (rows.length === 0) return emptyMessage(title)
    if (display === "bar" || display === "treemap") {
      return {
        kind: "ranked",
        title,
        display,
        rows: rows.map((row) => rankedPair(row.label, row.clicks)),
        valueLabel: "Clicks",
      }
    }
    return { kind: "table", title, ...searchTable("Page", rows) }
  }

  if (id === "paidSpend") {
    if (data.paid.spend == null && data.paid.byChannel.length === 0) return emptyMessage(title)
    if (display === "bar") {
      return {
        kind: "ranked",
        title,
        display: "bar",
        rows: data.paid.byChannel.map((row) => rankedPair(row.channel, row.spend)),
        valueLabel: "AV spend",
      }
    }
    return { kind: "tiles", title, tiles: tilesFor(id, settings, data), withSpark: false }
  }

  if (id === "costPer") {
    return { kind: "tiles", title, tiles: tilesFor(id, settings, data), withSpark: false }
  }

  return { kind: "message", title, message: "Not available yet" }
}

function tilesFor(id: WebElementId, settings: unknown, data: WebReportData): PreparedTile[] {
  if (id === "kpis") return kpiTiles((settings as { tiles: KpiSetting[] }).tiles, data)
  if (id === "snapshot" || id === "gscKpi") {
    return ((settings as { tiles: WebMetric[] }).tiles).map((metric) => tileForMetric(metric, data))
  }
  if (id === "paidSpend") {
    return [
      tileForMetric("avSpend", data),
      ...data.paid.byChannel.map((row) => ({
        label: row.channel,
        value: formatMoneyCompact(row.spend),
        current: row.spend,
        spark: [] as { value: number }[],
      })),
    ]
  }
  if (id === "costPer") {
    const events = data.ga4.current.keyEvents
    const cost = data.paid.spend != null && events != null && events > 0 ? data.paid.spend / events : null
    return [{
      label: "Cost per key event",
      value: formatMoneyCompact(cost),
      caption: "AV spend divided by GA4 key events",
      current: cost,
      spark: [],
    }]
  }
  return []
}

export function prepareWebElement(item: WebReportLayoutItem, data: WebReportData): PreparedDisplay {
  const title = WEB_REPORT_ELEMENTS[item.elementId]?.title ?? item.elementId
  const parsed = parseElementSettings(item.elementId, item.settings)
  if (!parsed.ok) return { kind: "message", title, message: "This element is not set up yet." }
  const view = elementViewState(item.elementId, data)
  if (view.status !== "ok") return { kind: "message", title, message: view.message }
  const display = renderableDisplay(item, data)
  return buildBody(item, data, display)
}
