import { formatMoneyCompact, formatPercent } from "@/lib/format/money"
import { formatChange, relativeChange } from "@/lib/webReport/change"
import { filterSearchAdsRows, sumSearchAds, type SearchAdsMetric, type SearchAdsPlatform } from "@/lib/webReport/searchAds"
import type { DeliveryStatus } from "@/lib/pacing/deliveryStatusFromPct"
import { elementViewState } from "@/lib/webReport/elementState"
import {
  coverageNote,
  kpiTrackerRows,
  kpiWindowProgress,
  monthLabel,
  type KpiTrackerRow,
  type WebKpiReportItem,
} from "@/lib/webReport/kpis/report"
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

/** Relative change versus the compared window. "—" when either side is missing or the previous value is zero. */
export type PreparedChange = { text: string; direction: "up" | "down" | "flat" }

export function prepareChange(current: number | null, previous: number | null): PreparedChange {
  const value = relativeChange(current, previous)
  return {
    text: formatChange(value),
    direction: value == null || value === 0 ? "flat" : value > 0 ? "up" : "down",
  }
}

export type PreparedTile = {
  label: string
  value: string | null
  caption?: string
  /** Raw numbers for a bullet. Target is absent when the tile has none. */
  current: number | null
  target?: number
  /** Bullet values when they differ from current/target (a saved KPI counts only targeted months). */
  bullet?: { measure: number; target: number }
  /** Formatted target. With it the tile shows status and progress. */
  expected?: string
  status?: DeliveryStatus
  /** Pace, 0..1 fills the bar. */
  progress?: number
  spark: { value: number }[]
  /** Only set when the element's compare setting is on. */
  change?: PreparedChange
}

export type PreparedTableCell = { text: string; shade?: number }

export type PreparedDisplay =
  | { kind: "message"; title: string; message: string }
  | { kind: "text"; title: string; text: string }
  | { kind: "tiles"; title: string; tiles: PreparedTile[]; withSpark: boolean }
  | { kind: "bullet"; title: string; rows: { label: string; measure: number; target: number }[]; plain: PreparedTile[] }
  | { kind: "series"; title: string; display: "combo" | "line" | "area" | "column"; data: Record<string, string | number>[]; bars: SeriesSpec[]; lines: SeriesSpec[]; hiddenByDefault?: string[]; note?: string; sharedAxis?: boolean }
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
  const value = totals[metric]
  if (value == null) return "—"
  if (metric === "engagementRate" || metric === "ctr") return formatPercent(value * 100)
  if (metric === "position") return POSITION.format(value)
  return NUMBER.format(value)
}

function metricNumber(metric: WebMetric, totals: PeriodTotals, paid: number | null): number | null {
  if (metric === "avSpend") return paid
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

function tileForMetric(metric: WebMetric, data: WebReportData, target?: number, compare = false): PreparedTile {
  const totals = gscMetric(metric) ? data.gsc.current : data.ga4.current
  const previousTotals = gscMetric(metric) ? data.gsc.previous : data.ga4.previous
  const paid = metric === "avSpend" ? data.paid.spend : null
  const previousPaid = metric === "avSpend" ? data.paid.previousSpend : null
  const caption = metric === "users" ? "Users (sum of daily)" : undefined
  const current = metricNumber(metric, totals, paid)
  const tile: PreparedTile = {
    label: METRIC_LABEL[metric],
    value: formatMetric(metric, totals, paid),
    caption,
    current,
    target,
    spark: sparkFor(metric, data),
  }
  if (compare) tile.change = prepareChange(current, metricNumber(metric, previousTotals, previousPaid))
  return tile
}

/** Sum of the named GA4 events in each window. Names not on the property count as zero. */
export function eventSum(data: WebReportData, names: readonly string[]): { count: number; previous: number } {
  const wanted = new Set(names)
  let count = 0
  let previous = 0
  for (const row of data.ga4.keyEventsByName) {
    if (!wanted.has(row.name)) continue
    count += row.count
    previous += row.previous
  }
  return { count, previous }
}

function eventTile(label: string, names: readonly string[], data: WebReportData, compare: boolean, target?: number): PreparedTile {
  const sum = eventSum(data, names)
  const tile: PreparedTile = {
    label,
    value: NUMBER.format(sum.count),
    caption: names.length > 1 ? `Sum of ${names.length} events` : undefined,
    current: sum.count,
    target,
    spark: [],
  }
  if (compare) tile.change = prepareChange(sum.count, sum.previous)
  return tile
}

type KpiSetting = {
  kind: string
  metric?: WebMetric
  eventName?: string
  eventNames?: string[]
  label?: string
  kpiId?: string
  target?: number
}

/** Only active KPIs are loaded, so a deactivated or missing KPI is null and its tile is hidden. */
function savedKpi(data: WebReportData, kpiId: string | undefined): WebKpiReportItem | null {
  if (!kpiId) return null
  return data.kpis?.items.find((item) => item.id === kpiId) ?? null
}

/** Last day counted as elapsed: today, or the source's latest data day when it lags. */
function kpiAsOf(item: WebKpiReportItem, data: WebReportData): string {
  const today = data.kpis?.today ?? data.windows.current.to
  const latest = item.source === "gsc_metric" ? data.gsc.maxDate : data.ga4.maxDate
  return latest && latest < today ? latest : today
}

/** Footnote on a saved KPI tile over a custom range. */
export const CUSTOM_TARGET_NOTE = "Target is the sum of monthly targets, prorated by days for part months"

function savedKpiTile(item: WebKpiReportItem, data: WebReportData): PreparedTile {
  const window = data.windows.current
  const total = item.window.total
  const spark = item.tracker.total == null ? [] : item.tracker.months.slice(-6).map((row) => ({ value: row.actual }))
  const tile: PreparedTile = {
    label: item.label,
    value: total == null ? null : NUMBER.format(total),
    current: total,
    spark,
  }
  if (total == null) return { ...tile, caption: "Source not connected" }
  const progress = kpiWindowProgress(item, window, kpiAsOf(item, data))
  if (progress.target == null) return { ...tile, caption: "No target" }
  const notes = [coverageNote(progress, window), data.windows.period === "custom" ? CUSTOM_TARGET_NOTE : null].filter(
    (note): note is string => note != null,
  )
  return {
    ...tile,
    target: progress.target,
    bullet: progress.actualToDate == null ? undefined : { measure: progress.actualToDate, target: progress.target },
    expected: `Target ${NUMBER.format(progress.target)}`,
    status: progress.status,
    progress: progress.pace ?? undefined,
    caption: notes.length > 0 ? notes.join(". ") : undefined,
  }
}

function kpiTiles(tiles: KpiSetting[], data: WebReportData, compare = false): PreparedTile[] {
  return tiles.flatMap((tile) => {
    if (tile.kind === "savedKpi") {
      const item = savedKpi(data, tile.kpiId)
      return item ? [savedKpiTile(item, data)] : []
    }
    if (tile.kind === "keyEvent") {
      const named = data.ga4.keyEventsByName.find((row) => row.name === tile.eventName)
      const prepared: PreparedTile = {
        label: tile.label ?? tile.eventName ?? "Key event",
        value: NUMBER.format(named?.count ?? 0),
        current: named?.count ?? 0,
        target: tile.target,
        spark: [],
      }
      if (compare) prepared.change = prepareChange(named?.count ?? 0, named?.previous ?? 0)
      return [prepared]
    }
    if (tile.kind === "eventSum") {
      const names = tile.eventNames ?? []
      return [eventTile(tile.label ?? names.join(" + "), names, data, compare, tile.target)]
    }
    const prepared = tileForMetric(tile.metric ?? "sessions", data, tile.target, compare)
    return [tile.label ? { ...prepared, label: tile.label } : prepared]
  })
}

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  ahead: "Ahead",
  "on-track": "On track",
  behind: "Behind",
  "no-data": "No data",
}

const SERIES_PALETTE = [CHART_SERIES.one, CHART_SERIES.two, CHART_SERIES.three] as const

function signed(value: number): string {
  return value > 0 ? `+${NUMBER.format(value)}` : NUMBER.format(value)
}

function trackerRowCells(row: KpiTrackerRow): PreparedTableCell[] {
  return [
    { text: row.label },
    { text: row.target == null ? "No target" : NUMBER.format(row.target) },
    { text: row.actual == null ? "—" : NUMBER.format(row.actual) },
    { text: row.variance == null ? "—" : signed(row.variance) },
    { text: row.target == null ? "No target" : STATUS_LABEL[row.status] },
  ]
}

/** Months as rows, one block per KPI. Months without a target keep the actual and read "No target". */
export function kpiTrackerModel(
  items: readonly WebKpiReportItem[],
  data: WebReportData,
  months: number,
  display: WebDisplay,
  title: string,
): PreparedDisplay {
  const trackerMonths = data.kpis?.trackerMonths ?? []
  const spanTo = data.windows.current.to
  const blocks = items.map((item) => ({
    item,
    rows: kpiTrackerRows(item, trackerMonths, months, spanTo, kpiAsOf(item, data)),
  }))
  if (display === "table") {
    const multi = blocks.length > 1
    return {
      kind: "table",
      title,
      headers: [...(multi ? ["KPI"] : []), "Month", "Target", "Actual", "Variance", "Status"],
      rows: blocks.flatMap(({ item, rows }) =>
        rows.map((row) => ({
          key: `${item.id}-${row.month}`,
          cells: [...(multi ? [{ text: item.label }] : []), ...trackerRowCells(row)],
        })),
      ),
      note: "Variance is actual minus the month's target. The current month is paced to date.",
    }
  }
  const chartMonths = trackerMonths.slice(-months)
  const rows = chartMonths.map((month, index) => {
    const row: Record<string, string | number> = { date: monthLabel(month) }
    blocks.forEach(({ rows: kpiRows }, kpiIndex) => {
      const point = kpiRows[index]
      if (point?.actual != null) row[`actual${kpiIndex}`] = point.actual
      if (point?.target != null) row[`target${kpiIndex}`] = point.target
    })
    return row
  })
  const named = (label: string, kind: "actual" | "target") =>
    blocks.length > 1 ? `${label} ${kind}` : kind === "actual" ? "Actual" : "Target"
  const actualSpecs = blocks.map(({ item }, kpiIndex) => ({
    key: `actual${kpiIndex}`,
    label: named(item.label, "actual"),
    color: SERIES_PALETTE[kpiIndex % SERIES_PALETTE.length],
  }))
  const targetSpecs = blocks.map(({ item }, kpiIndex) => ({
    key: `target${kpiIndex}`,
    label: named(item.label, "target"),
    color: blocks.length > 1 ? SERIES_PALETTE[kpiIndex % SERIES_PALETTE.length] : CHART_SERIES.ink,
  }))
  const untargeted = [...new Set(blocks.flatMap(({ rows: kpiRows }) => kpiRows.filter((row) => row.target == null).map((row) => row.label)))]
  const note = untargeted.length > 0 ? `No target: ${untargeted.join(", ")}. Those months show the actual only.` : undefined
  if (display === "column") {
    return { kind: "series", title, display: "column", data: rows, bars: [...actualSpecs, ...targetSpecs], lines: [], note }
  }
  return { kind: "series", title, display: "combo", data: rows, bars: actualSpecs, lines: targetSpecs, note, sharedAxis: true }
}

function hasSpark(tiles: PreparedTile[]): boolean {
  return tiles.some((tile) => tile.spark.length > 0)
}

function bulletRows(tiles: PreparedTile[]): { label: string; measure: number; target: number }[] {
  return tiles.flatMap((tile) => {
    const measure = tile.bullet?.measure ?? tile.current
    const target = tile.bullet?.target ?? tile.target
    if (target == null || measure == null) return []
    const top = Math.max(measure, target, 1)
    return [{ label: tile.label, measure: (measure / top) * 100, target: (target / top) * 100 }]
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

type SourceColumn = "users" | "sessions" | "keyEvents" | "engagementRate"

const SOURCE_COLUMN_LABEL: Record<SourceColumn, string> = {
  users: "Users (sum of daily)",
  sessions: "Sessions",
  keyEvents: "Key events",
  engagementRate: "Engagement rate",
}

const CHANGE_HEADER = "% Δ"

function sourceValue(row: SourceMediumRow, column: SourceColumn): number | null {
  if (column === "users") return row.users ?? null
  if (column === "engagementRate") return row.engagementRate
  return column === "sessions" ? row.sessions : row.keyEvents
}

function sourcePrevious(row: SourceMediumRow, column: SourceColumn): number | null {
  if (!row.previous) return null
  return row.previous[column]
}

function sourceTable(rows: SourceMediumRow[], columns: SourceColumn[], shadeOn: boolean, compare = false) {
  const totals = {
    sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
    keyEvents: rows.reduce((sum, row) => sum + row.keyEvents, 0),
  }
  const headers = [
    "Source / medium",
    ...columns.flatMap((column) => (compare ? [SOURCE_COLUMN_LABEL[column], CHANGE_HEADER] : [SOURCE_COLUMN_LABEL[column]])),
  ]
  return {
    headers,
    rows: rows.map((row) => ({
      key: sourceLabel(row),
      cells: [
        { text: sourceLabel(row) },
        ...columns.flatMap((column) => {
          const share = column === "sessions"
            ? row.sessions / (totals.sessions || 1)
            : column === "keyEvents"
              ? row.keyEvents / (totals.keyEvents || 1)
              : 0
          const value = sourceValue(row, column)
          const text = column === "engagementRate"
            ? value == null ? "—" : formatPercent(value * 100)
            : value == null ? "—" : NUMBER.format(value)
          const cell: PreparedTableCell = { text, shade: shade(share, shadeOn) }
          if (!compare) return [cell]
          return [cell, { text: prepareChange(value, sourcePrevious(row, column)).text }]
        }),
      ],
    })),
    ...(compare ? { note: "% Δ is the change vs the previous period." } : {}),
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

function pageTable(rows: PageRow[], topN: number, heading: string, compare = false) {
  if (compare) {
    const change = (current: number, previous: number | undefined) => ({
      text: prepareChange(current, previous ?? null).text,
    })
    return {
      headers: [heading, "Page views", CHANGE_HEADER, "Users", CHANGE_HEADER, "Key events", CHANGE_HEADER],
      rows: rows.slice(0, topN).map((row) => ({
        key: row.page,
        cells: [
          { text: row.page },
          { text: NUMBER.format(row.pageViews) },
          change(row.pageViews, row.previous?.pageViews),
          { text: NUMBER.format(row.users) },
          change(row.users, row.previous?.users),
          { text: NUMBER.format(row.keyEvents) },
          change(row.keyEvents, row.previous?.keyEvents),
        ],
      })),
      note: "Users are summed across days. % Δ is the change vs the previous period.",
    }
  }
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
  if (item.elementId === "kpiTracker") return true
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

  if (id === "kpiTracker") {
    const spec = settings as { kpiIds: string[]; months: "6" | "12" }
    if (spec.kpiIds.length === 0) return { kind: "message", title, message: "Pick a saved KPI for the tracker." }
    const items = spec.kpiIds.flatMap((kpiId) => savedKpi(data, kpiId) ?? [])
    if (items.length === 0) return { kind: "message", title, message: "No active saved KPIs." }
    return kpiTrackerModel(items, data, Number(spec.months), display, title)
  }

  if (display === "tiles" || display === "spark") {
    const tiles = tilesFor(id, settings, data)
    if (tiles.length === 0) return { kind: "message", title, message: "No active KPIs in this element." }
    return { kind: "tiles", title, tiles, withSpark: display === "spark" && hasSpark(tiles) }
  }

  if (display === "bullet") {
    const tiles = tilesFor(id, settings, data)
    const rows = bulletRows(tiles)
    return {
      kind: "bullet",
      title,
      rows,
      plain: tiles.filter((tile) => (tile.bullet?.target ?? tile.target) == null),
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
    const spec = settings as { topN: number; columns: SourceColumn[]; shade: boolean; compare?: boolean }
    const rows = data.ga4.sourceMedium.slice(0, spec.topN)
    if (rows.length === 0) return emptyMessage(title)
    if (display === "table") {
      return { kind: "table", title, ...sourceTable(rows, spec.columns, spec.shade, spec.compare === true) }
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
    const { topN, compare } = settings as { topN: number; compare?: boolean }
    const source = id === "pages" ? data.ga4.pages : data.ga4.landing
    const heading = id === "pages" ? "Page title" : "Page path"
    if (source.length === 0) return emptyMessage(title)
    if (display === "table") return { kind: "table", title, ...pageTable(source, topN, heading, compare === true) }
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

  if (id === "searchAds") {
    return { kind: "tiles", title, tiles: tilesFor(id, settings, data), withSpark: false }
  }

  return { kind: "message", title, message: "Not available yet" }
}

function tilesFor(id: WebElementId, settings: unknown, data: WebReportData): PreparedTile[] {
  if (id === "kpis") {
    const spec = settings as { tiles: KpiSetting[]; compare?: boolean }
    return kpiTiles(spec.tiles, data, spec.compare === true)
  }
  if (id === "snapshot" || id === "gscKpi") {
    const spec = settings as { tiles: WebMetric[]; eventTiles?: { label: string; eventNames: string[] }[]; compare?: boolean }
    const compare = spec.compare === true
    return [
      ...spec.tiles.map((metric) => tileForMetric(metric, data, undefined, compare)),
      ...(spec.eventTiles ?? []).map((tile) => eventTile(tile.label, tile.eventNames, data, compare)),
    ]
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
  if (id === "searchAds") {
    return searchAdsTiles(settings as SearchAdsSetting, data)
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

type SearchAdsSetting = {
  tiles: SearchAdsMetric[]
  platform: SearchAdsPlatform
  campaignContains?: string
  label?: string
  compare?: boolean
}

const SEARCH_ADS_LABEL: Record<SearchAdsMetric, string> = {
  impressions: "Impressions",
  clicks: "Clicks",
  spend: "Spend",
}

/** Impressions, clicks or platform spend for the matching campaigns, with change vs the compared window. */
export function searchAdsTiles(spec: SearchAdsSetting, data: WebReportData): PreparedTile[] {
  const rows = filterSearchAdsRows(data.searchAds?.campaigns ?? [], spec)
  const sum = sumSearchAds(rows)
  const prefix = spec.label ?? (spec.platform === "google" ? "Google Ads" : "Paid search")
  const filter = spec.campaignContains?.trim()
  const caption = filter
    ? `${rows.length} campaign${rows.length === 1 ? "" : "s"} containing "${filter}"`
    : undefined
  return spec.tiles.map((metric) => {
    const current = sum.current[metric]
    const tile: PreparedTile = {
      label: `${prefix} ${SEARCH_ADS_LABEL[metric].toLowerCase()}`,
      value: metric === "spend" ? formatMoneyCompact(current) : NUMBER.format(current),
      caption,
      current,
      spark: [],
    }
    if (spec.compare === true) tile.change = prepareChange(current, sum.previous[metric])
    return tile
  })
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
