import { fmt } from "@/lib/chart-theme"
import { formatDateShort } from "@/lib/format/date"

export type DeliveryDailyChartSeries = {
  key: string
  label: string
  yAxis?: "left" | "right"
  /**
   * Omitted left series are money (`fmt.currencyCompact`). Omitted right series
   * and explicit `number` / `compact` are `fmt.compact`. `percent` stays a rate.
   */
  format?: "dollars" | "number" | "compact" | "percent"
}

/** Forest / sky / lime chart tokens. Channel colour stays on the card dot. */
export const DELIVERY_CHART_COLOUR = {
  delivered: "var(--av-chart-1)",
  planned: "var(--av-chart-2)",
  cumulativePace: "var(--av-chart-3)",
  today: "var(--av-ink)",
  metric: "var(--av-ink)",
} as const

/** Channel chart: 180px below 640px, 240px from the `sm` breakpoint up. */
export const DELIVERY_CHART_CHANNEL_HEIGHT_CLASS = "h-[180px] sm:h-[240px]"

/** Same chart at the small size (the under-640 height). */
export const DELIVERY_CHART_LINE_HEIGHT_CLASS = "h-[180px]"

export const DELIVERY_CHART_HEIGHT_CLASS = {
  channel: DELIVERY_CHART_CHANNEL_HEIGHT_CLASS,
  line: DELIVERY_CHART_LINE_HEIGHT_CLASS,
} as const

export type DeliveryChartSize = keyof typeof DELIVERY_CHART_HEIGHT_CLASS

export type DeliveryChartMeasure = "money" | "count"

export type DeliveryChartEmpty =
  | { kind: "starts"; dateLabel: string }
  | { kind: "awaiting-first-report" }

export type DeliveryChartPoint = {
  date: string
  delivered: number | null
  planned: number | null
  cumulativePace: number | null
}

export type DeliveryChartSpec = {
  title: string
  status?: string | null
  summary?: string | null
  measure: DeliveryChartMeasure
  height: DeliveryChartSize
  points: DeliveryChartPoint[]
  empty?: DeliveryChartEmpty | null
  asAtDate?: string | null
}

export type DeliveryPaintMark = "bar" | "dashed" | "line"

export type DeliveryValueFormat = "dollars" | "compact" | "percent"

export type DeliveryPaintSeries = {
  key: string
  label: string
  axis: "left" | "right"
  format: DeliveryValueFormat
  mark: DeliveryPaintMark
  colour: string
}

export function resolveDeliveryFormat(
  format: DeliveryDailyChartSeries["format"] | undefined,
  axis: "left" | "right",
): DeliveryValueFormat {
  if (format === "percent") return "percent"
  if (format === "dollars") return "dollars"
  if (format === "number" || format === "compact") return "compact"
  return axis === "right" ? "compact" : "dollars"
}

/** Money uses `fmt.currencyCompact`. Counts use `fmt.compact`. Rates stay percent. */
export function formatDeliveryValue(format: DeliveryValueFormat, value: number): string {
  if (format === "dollars") return fmt.currencyCompact(value)
  if (format === "percent") return fmt.percent(value > 1 ? value / 100 : value)
  return fmt.compact(value)
}

export function deliveryFormatterName(format: DeliveryValueFormat): "currency-compact" | "compact" | "percent" {
  if (format === "dollars") return "currency-compact"
  if (format === "percent") return "percent"
  return "compact"
}

export function seriesFromSpec(spec: DeliveryChartSpec): DeliveryDailyChartSeries[] {
  const format: DeliveryDailyChartSeries["format"] = spec.measure === "money" ? "dollars" : "compact"
  const out: DeliveryDailyChartSeries[] = []
  if (spec.points.some((point) => point.delivered != null)) {
    out.push({ key: "delivered", label: "Delivered", yAxis: "left", format })
  }
  if (spec.points.some((point) => point.planned != null)) {
    out.push({ key: "planned", label: "Planned", yAxis: "left", format })
  }
  if (spec.points.some((point) => point.cumulativePace != null)) {
    out.push({ key: "cumulativePace", label: "Cumulative pace", yAxis: "left", format })
  }
  return out
}

export function rowsFromSpec(
  spec: DeliveryChartSpec,
): Array<Record<string, string | number | null>> {
  return spec.points.map((point) => ({
    date: point.date,
    delivered: point.delivered,
    planned: point.planned,
    cumulativePace: point.cumulativePace,
  }))
}

export function paintSeries(series: DeliveryDailyChartSeries[]): DeliveryPaintSeries[] {
  let leftBars = 0
  return series.map((item) => {
    const axis = item.yAxis === "right" ? "right" : "left"
    if (item.key === "planned") {
      return {
        key: item.key,
        label: item.label,
        axis: "left",
        format: resolveDeliveryFormat(item.format, "left"),
        mark: "dashed",
        colour: DELIVERY_CHART_COLOUR.planned,
      }
    }
    if (item.key === "cumulativePace") {
      return {
        key: item.key,
        label: item.label,
        axis: "left",
        format: resolveDeliveryFormat(item.format, "left"),
        mark: "line",
        colour: DELIVERY_CHART_COLOUR.cumulativePace,
      }
    }
    if (axis === "right") {
      return {
        key: item.key,
        label: item.label,
        axis,
        format: resolveDeliveryFormat(item.format, axis),
        mark: "line",
        colour: DELIVERY_CHART_COLOUR.metric,
      }
    }
    if (leftBars === 0) {
      leftBars += 1
      return {
        key: item.key,
        label: item.label,
        axis,
        format: resolveDeliveryFormat(item.format, axis),
        mark: "bar",
        colour: DELIVERY_CHART_COLOUR.delivered,
      }
    }
    return {
      key: item.key,
      label: item.label,
      axis,
      format: resolveDeliveryFormat(item.format, axis),
      mark: "line",
      colour: DELIVERY_CHART_COLOUR.metric,
    }
  })
}

export function blankFutureDays<T extends Record<string, string | number | null>>(
  rows: T[],
  asAtDate: string | null | undefined,
  valueKeys: string[],
): T[] {
  if (!asAtDate) return rows
  return rows.map((row) => {
    const date = String(row.date ?? "")
    if (!date || date <= asAtDate) return row
    const next: Record<string, string | number | null> = { ...row }
    for (const key of valueKeys) {
      if (key in next) next[key] = null
    }
    return next as T
  })
}

export function countFutureBlanked(
  rows: Array<Record<string, string | number | null>>,
  asAtDate: string | null | undefined,
): number {
  if (!asAtDate) return 0
  return rows.filter((row) => {
    const date = String(row.date ?? "")
    return date !== "" && date > asAtDate
  }).length
}

export function todayLineDate(
  dates: string[],
  asAtDate: string | null | undefined,
): string | null {
  if (!asAtDate) return null
  return dates.includes(asAtDate) ? asAtDate : null
}

/** Inclusive span. Longer than this, the axis ticks Mondays. */
export const DELIVERY_AXIS_WEEKLY_AFTER_DAYS = 60

/** Shorter windows tick every third plotted day, starting at the first day. */
export const DELIVERY_AXIS_FEW_DAY_STEP = 3

export type DeliveryAxisTick = {
  iso: string
  day: string
  /** Short month, only on the first tick of that month. Empty on the rest. */
  month: string
}

function utcMidnight(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
}

function windowDayCount(dates: string[]): number {
  let min = dates[0] ?? ""
  let max = dates[0] ?? ""
  for (const iso of dates) {
    if (iso < min) min = iso
    if (iso > max) max = iso
  }
  if (!min || !max) return 0
  return Math.round((utcMidnight(max) - utcMidnight(min)) / 86_400_000) + 1
}

function isMondayUtc(iso: string): boolean {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1
}

/**
 * Ticks for the delivery chart. Windows longer than 60 days tick Mondays.
 * Shorter windows tick every third day. The month name is only on the first
 * tick of that month, drawn under the day number.
 */
export function deliveryAxisPlan(dates: string[]): DeliveryAxisTick[] {
  const isos = dates.filter((iso) => iso.length >= 10)
  if (isos.length === 0) return []
  const weekly = windowDayCount(isos) > DELIVERY_AXIS_WEEKLY_AFTER_DAYS
  const mondays = isos.filter(isMondayUtc)
  const selected = weekly && mondays.length > 0
    ? mondays
    : isos.filter((_, index) => index % DELIVERY_AXIS_FEW_DAY_STEP === 0)
  let previousMonth = ""
  return selected.map((iso) => {
    const monthKey = iso.slice(0, 7)
    const showMonth = monthKey !== previousMonth
    previousMonth = monthKey
    const { day, month } = deliveryAxisTick(iso, showMonth)
    return { iso, day, month }
  })
}

export function deliveryAxisShowsMonth(dates: string[], index: number): boolean {
  if (index <= 0) return true
  const current = dates[index] ?? ""
  const previous = dates[index - 1] ?? ""
  return current.slice(0, 7) !== previous.slice(0, 7)
}

export function deliveryAxisTick(iso: string, showMonth: boolean): { month: string; day: string } {
  const dayNumber = Number(iso.slice(8, 10))
  const day = Number.isFinite(dayNumber) && iso.length >= 10 ? String(dayNumber) : iso
  if (!showMonth || iso.length < 7) return { month: "", day }
  const month = new Intl.DateTimeFormat("en-AU", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
  return { month, day }
}

export function deliveryChartEmptyCopy(input: {
  startsOn?: string | null
  asAtDate?: string | null
  todayISO: string
  empty?: DeliveryChartEmpty | null
}): string {
  if (input.empty?.kind === "starts") return `Starts ${input.empty.dateLabel}`
  if (input.empty?.kind === "awaiting-first-report") return "Awaiting first report"
  const cutoff = input.asAtDate || input.todayISO
  if (input.startsOn && input.startsOn > cutoff) return `Starts ${formatDateShort(input.startsOn)}`
  return "Awaiting first report"
}
