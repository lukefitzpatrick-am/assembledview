/**
 * Pure social delivery metric helpers extracted from SocialDeliveryContainer.
 */
import type { Burst, ActualsDaily } from "@/lib/pacing/mockMetaPacing"
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric"
import type { PacingResult, PacingSeriesPoint } from "@/lib/pacing/calcPacing"
import { getDeliverableKey } from "@/lib/pacing/calcPacing"
import { MetaPacingRow, normalisePlatform, summariseDelivery } from "@/lib/pacing/social/metaPacing"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import { getMelbourneTodayISO, getPacingWindow } from "@/lib/pacing/pacingWindow"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import {
  buildCumulativeTargetCurve,
  buildCumulativeActualSeries,
  evaluateOnTrack,
  type TargetCurveLineItem,
  type TargetCurvePoint,
  type OnTrackStatus,
} from "@/lib/kpi/deliveryTargetCurve"
import { clipDateRangeToCampaign, filterDailySeriesByRange, parseDateOnly, type DateRange } from "@/lib/dashboard/dateFilter"


export type SocialLineItem = {
  line_item_id: string
  line_item_name?: string
  buy_type?: string
  platform?: string
  bursts?: Burst[]
  bursts_json?: string | Burst[]
  total_budget?: number
  deliverables_total?: number
  goal_deliverable_total?: number
  fixed_cost_media?: boolean
  [key: string]: any
}

export type SocialLineMetrics = {
  
  lineItem: SocialLineItem
  pacing: PacingResult
  bursts: Burst[]
  window: { startISO?: string; endISO?: string; startDate: Date | null; endDate: Date | null }
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[]
  matchedRows: MetaPacingRow[]
  matchBreakdown: { targetId: string | null; byId: number; platform: string | null }
  booked: { spend: number; deliverables: number }
  delivered: { spend: number; deliverables: number }
  shouldToDate: { spend: number; deliverables: number }
  deliverableKey: ReturnType<typeof resolveDeliverableKey>
  targetMetric: "clicks" | "views" | null
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  onTrackStatus: OnTrackStatus
}

function isMetaPlatform(value: string | undefined) {
  if (!value) return false
  const lower = String(value).toLowerCase()
  return /\b(meta|facebook|instagram|ig)\b/.test(lower)
}

function isTikTokPlatform(value: string | undefined) {
  if (!value) return false
  const lower = String(value).toLowerCase()
  return /\btik\s*tok\b/.test(lower)
}

const cleanId = (v: any) => {
  const s = String(v ?? "").trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === "undefined" || lower === "null") return null
  return lower
}
const getRowLineItemId = (row: any): string | null => {
  return cleanId(row?.lineItemId ?? row?.LINE_ITEM_ID ?? row?.line_item_id)
}

const round2 = (n: number) => Number((n || 0).toFixed(2))

export function mapCombinedRowToMeta(row: CombinedPacingRow): MetaPacingRow {
  return {
    channel: row.channel as any,
    dateDay: row.dateDay,
    adsetName: row.adsetName ?? "",
    lineItemId: row.lineItemId ?? undefined,
    campaignId: row.campaignId ?? undefined,
    campaignName: row.campaignName ?? undefined,
    adsetId: row.adsetId ?? undefined,
    amountSpent: row.amountSpent ?? 0,
    impressions: row.impressions ?? 0,
    clicks: row.clicks ?? 0,
    results: row.results ?? 0,
    video3sViews: row.video3sViews ?? 0,
  }
}

export function classifyPlatform(platformValue: unknown, fallbackName: string | null | undefined): "meta" | "tiktok" | null {
  const platform = String(platformValue ?? "").trim()
  if (platform) {
    if (isMetaPlatform(platform)) return "meta"
    if (isTikTokPlatform(platform)) return "tiktok"
  }

  const name = String(fallbackName ?? "").trim()
  if (name) {
    const upper = name.toUpperCase()
    if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(upper)) return "meta"
    if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(upper)) return "tiktok"
  }

  return null
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function toISO(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10)
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function eachDay(start: Date, end: Date): string[] {
  const dates: string[] = []
  const cursor = startOfDay(start)
  const endDate = startOfDay(end)
  while (cursor <= endDate) {
    dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function inclusiveDays(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const diff = endOfDay(end).getTime() - startOfDay(start).getTime()
  if (diff < 0) return 0
  return Math.floor(diff / msPerDay) + 1
}

function parseCurrency(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "")
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function sumBookedFromBursts(bursts: Burst[]) {
  return bursts.reduce(
    (acc, burst) => {
      const spend = parseCurrency(
        burst.budget_number ?? burst.media_investment ?? burst.buy_amount_number ?? 0
      )
      const deliverables = parseCurrency(
        (burst as any).calculated_value_number ?? (burst as any).deliverables ?? 0
      )

      return {
        spend: acc.spend + spend,
        deliverables: acc.deliverables + deliverables,
      }
    },
    { spend: 0, deliverables: 0 }
  )
}

function sumDeliveredUpToDate(
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[],
  deliverableKey: ReturnType<typeof getDeliverableKey> | "deliverable_value" | null,
  asAtISO?: string | null
) {
  const cutoff = asAtISO ?? null
  return actualsDaily.reduce(
    (acc, day) => {
      if (cutoff && day.date > cutoff) return acc
      const deliverableValue =
        deliverableKey && deliverableKey !== "deliverable_value"
          ? (day as any)[deliverableKey] ?? 0
          : (day as any).deliverable_value ?? (day as any).results ?? 0

      return {
        spend: acc.spend + (day.spend ?? 0),
        deliverables: acc.deliverables + (deliverableValue ?? 0),
      }
    },
    { spend: 0, deliverables: 0 }
  )
}

function previousCalendarDayISO(iso: string): string {
  const d = parseDateSafe(iso)
  if (!d) return iso
  const prev = startOfDay(d)
  prev.setDate(prev.getDate() - 1)
  return toISO(prev)
}

/** Burst-expected spend or deliverables allocated to [range.start, range.end] (inclusive). */
function expectedInWindowFromBursts(
  bursts: Burst[],
  range: DateRange,
  kind: "spend" | "deliverables",
): number {
  if (!range.start || !range.end) return 0
  const startISO = toISO(startOfDay(range.start))
  const endISO = toISO(startOfDay(range.end))
  const beforeISO = previousCalendarDayISO(startISO)
  const cumEnd = computeShouldToDateFromBursts(bursts, endISO, kind)
  const cumBefore = computeShouldToDateFromBursts(bursts, beforeISO, kind)
  return Math.max(0, cumEnd - cumBefore)
}

function sumDeliveredFiltered(
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[],
  deliverableKey: ReturnType<typeof getDeliverableKey> | "deliverable_value" | null,
) {
  return actualsDaily.reduce(
    (acc, day) => {
      const deliverableValue =
        deliverableKey && deliverableKey !== "deliverable_value"
          ? (day as any)[deliverableKey] ?? 0
          : (day as any).deliverable_value ?? (day as any).results ?? 0

      return {
        spend: acc.spend + (day.spend ?? 0),
        deliverables: acc.deliverables + (deliverableValue ?? 0),
      }
    },
    { spend: 0, deliverables: 0 },
  )
}

function normalizeBurst(raw: Record<string, any>): Burst {
  const startDate =
    raw.start_date || raw.startDate || raw.start || raw.beginDate || raw.begin_date || ""
  const endDate = raw.end_date || raw.endDate || raw.end || raw.stopDate || raw.stop_date || ""

  const budgetNumber = parseCurrency(
    raw.budget_number ??
      raw.budget ??
      raw.media_investment ??
      raw.mediaInvestment ??
      raw.buy_amount_number ??
      raw.buyAmount
  )
  const buyAmountNumber = parseCurrency(raw.buy_amount_number ?? raw.buy_amount ?? raw.buyAmount)
  const calculatedValueNumber = parseCurrency(
    raw.calculated_value_number ?? raw.calculatedValue ?? raw.deliverables ?? raw.deliverable
  )

  const mediaInvestment =
    typeof raw.media_investment === "number"
      ? raw.media_investment
      : budgetNumber || buyAmountNumber
  const deliverables =
    typeof raw.deliverables === "number" || typeof raw.deliverable === "number"
      ? raw.deliverables ?? raw.deliverable
      : calculatedValueNumber

  return {
    start_date: startDate,
    end_date: endDate,
    startDate,
    endDate,
    media_investment: Number.isFinite(mediaInvestment) ? mediaInvestment : 0,
    deliverables: Number.isFinite(deliverables) ? deliverables : 0,
    budget_number: Number.isFinite(budgetNumber) ? budgetNumber : 0,
    buy_amount_number: Number.isFinite(buyAmountNumber) ? buyAmountNumber : 0,
    calculated_value_number: Number.isFinite(calculatedValueNumber) ? calculatedValueNumber : 0,
  }
}

function parseBursts(raw: SocialLineItem["bursts"] | SocialLineItem["bursts_json"]): Burst[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((b) => normalizeBurst(b as Record<string, any>))
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.map((b) => normalizeBurst(b as Record<string, any>))
        : []
    } catch {
      return []
    }
  }
  return []
}


export function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

export function formatCurrency2dp(value: number | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

export function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-AU")
}

export function formatWholeNumber(value: number | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-AU")
}

function formatDateAU(dateString: string | undefined) {
  if (!dateString) return "—"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

function formatChartDateLabel(iso: string | undefined) {
  if (!iso) return "—"
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric" }).format(d)
}

function formatCompactNumber(value: number | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat("en-AU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

export function formatLineItemHeader(lineItem: SocialLineItem) {
  const platform = String(lineItem.platform ?? "").trim()
  const targeting = String((lineItem as any).creative_targeting ?? "").trim()
  const parts = [platform, targeting].filter(Boolean)
  if (parts.length) return parts.join(" • ")
  return lineItem.line_item_name || lineItem.line_item_id || "Line item"
}

export function getLineItemNameCandidate(item: SocialLineItem) {
  return (
    item.line_item_name ??
    (item as any).lineItemName ??
    (item as any).creative_targeting ??
    (item as any).creative ??
    ""
  )
}

function resolveDeliverableKey(
  buyType: string | undefined,
  platform?: string | undefined
): ReturnType<typeof getDeliverableKey> {
  const metric = mapDeliverableMetric({ channel: "social", buyType, platform })
  switch (metric) {
    case "VIDEO_3S_VIEWS":
      return "video_3s_views"
    case "RESULTS":
      return "results"
    case "CLICKS":
      return "clicks"
    case "IMPRESSIONS":
    default:
      return "impressions"
  }
}

/**
 * Map a social line item's deliverable key to the TargetCurve metric.
 * Returns null when the metric has no KPI target (e.g. impressions, which
 * aren't in the KPI tuple today).
 */
function targetMetricForDeliverableKey(
  deliverableKey: ReturnType<typeof resolveDeliverableKey>,
): "clicks" | "views" | null {
  switch (deliverableKey) {
    case "clicks":
      return "clicks"
    case "video_3s_views":
      return "views"
    case "results":
      return null
    case "impressions":
    default:
      return null
  }
}

/**
 * Build a TargetCurveLineItem for a social line item. Returns null when the
 * deliverable key doesn't map to a KPI metric or when deliverables = 0.
 */
function buildSocialTargetCurveLineItem(item: SocialLineItem, bursts: Burst[]): TargetCurveLineItem | null {
  const publisher = String(
    item?.platform ?? (item as any)?.site ?? (item as any)?.publisher ?? "",
  )
    .trim()
    .toLowerCase()
  const bidStrategy = String(
    (item as any)?.bid_strategy ?? (item as any)?.bidStrategy ?? item?.buy_type ?? "",
  )
    .trim()
    .toLowerCase()
  const buyType = String(item?.buy_type ?? "").trim().toLowerCase()

  const explicitDeliverables =
    Number(item?.goal_deliverable_total ?? item?.deliverables_total ?? 0) || 0
  const burstDeliverables = bursts.reduce(
    (sum, b) => sum + (Number((b as any)?.deliverables ?? (b as any)?.deliverablesAmount ?? 0) || 0),
    0,
  )
  const deliverables = explicitDeliverables > 0 ? explicitDeliverables : burstDeliverables
  if (deliverables <= 0) return null

  let earliestStartISO: string | null = null
  let latestEndISO: string | null = null
  for (const b of bursts) {
    const start =
      (b as any).startISO ??
      (b as any).start ??
      (b as any).startDate ??
      (b as any).start_date ??
      null
    const end =
      (b as any).endISO ?? (b as any).end ?? (b as any).endDate ?? (b as any).end_date ?? null
    if (start && (!earliestStartISO || start < earliestStartISO)) earliestStartISO = start
    if (end && (!latestEndISO || end > latestEndISO)) latestEndISO = end
  }

  return {
    mediaType: "socialmedia",
    publisher,
    bidStrategy,
    buyType,
    deliverables,
    earliestStartISO,
    latestEndISO,
  }
}

export function getDeliverableLabel(deliverableKey: ReturnType<typeof getDeliverableKey> | null) {
  switch (deliverableKey) {
    case "clicks":
      return "Clicks"
    case "results":
      return "Conversions"
    case "video_3s_views":
      return "Video Views"
    case "impressions":
    default:
      return "Impressions"
  }
}

export function normalizeLineItems(lineItems: SocialLineItem[]) {
  return lineItems.map((item) => {
    const bursts = parseBursts(item.bursts || item.bursts_json)
    const budget =
      item.total_budget ??
      item.budget ??
      bursts.reduce(
        (sum, b) => sum + (b.budget_number ?? b.media_investment ?? b.buy_amount_number ?? 0),
        0
      )
    const deliverableTotal =
      item.goal_deliverable_total ??
      item.deliverables_total ??
      bursts.reduce(
        (sum, b) => sum + (b.calculated_value_number ?? b.deliverables ?? 0),
        0
      )

    return {
      ...item,
      bursts,
      total_budget: budget,
      goal_deliverable_total: deliverableTotal,
    }
  })
}

function resolveLineItemRange(
  item: SocialLineItem,
  fallbackStart?: string,
  fallbackEnd?: string
) {
  const bursts = item.bursts ?? parseBursts(item.bursts_json)
  const dates: string[] = []
  bursts.forEach((burst) => {
    if (burst.start_date) dates.push(burst.start_date)
    if (burst.end_date) dates.push(burst.end_date)
  })

  const start =
    (dates.length ? dates.sort()[0] : null) ??
    item.start_date ??
    item.startDate ??
    item.start ??
    fallbackStart
  const end =
    (dates.length ? dates.sort().slice(-1)[0] : null) ??
    item.end_date ??
    item.endDate ??
    item.end ??
    fallbackEnd

  return { start, end, bursts }
}

function getLineItemWindow(bursts: Burst[], fallbackStart?: string, fallbackEnd?: string) {
  const starts: Date[] = []
  const ends: Date[] = []

  bursts.forEach((burst) => {
    const s = parseDateSafe(burst.start_date)
    const e = parseDateSafe(burst.end_date)
    if (s) starts.push(s)
    if (e) ends.push(e)
  })

  const fallbackStartDate = parseDateSafe(fallbackStart ?? undefined)
  const fallbackEndDate = parseDateSafe(fallbackEnd ?? undefined)

  const startDate = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : fallbackStartDate
  const endDate = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : fallbackEndDate

  return {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    startISO: startDate ? toISO(startDate) : undefined,
    endISO: endDate ? toISO(endDate) : undefined,
  }
}

function computeShouldToDateFromBursts(
  bursts: Burst[],
  asAtISO: string,
  kind: "spend" | "deliverables"
) {
  const asAtDate = parseDateSafe(asAtISO)
  if (!asAtDate) return 0

  return bursts.reduce((sum, burst) => {
    const burstStart = parseDateSafe(burst.start_date)
    const burstEnd = parseDateSafe(burst.end_date)
    if (!burstStart || !burstEnd) return sum

    const total =
      kind === "spend"
        ? burst.budget_number ?? burst.media_investment ?? burst.buy_amount_number ?? 0
        : (burst as any).calculated_value_number ?? (burst as any).deliverables ?? 0

    const duration = inclusiveDays(burstStart, burstEnd)
    if (duration <= 0) return sum

    if (asAtDate < burstStart) return sum
    const elapsedEnd = asAtDate > burstEnd ? burstEnd : asAtDate
    const elapsed = inclusiveDays(burstStart, elapsedEnd)
    const should = (total / duration) * elapsed
    return sum + should
  }, 0)
}

function buildCumulativeSeries(
  dates: string[],
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[],
  deliverableKey: ReturnType<typeof getDeliverableKey> | "deliverable_value" | null
): PacingSeriesPoint[] {
  const actualMap = new Map<string, (ActualsDaily & { deliverable_value?: number })>()
  actualsDaily.forEach((day) => actualMap.set(day.date, day))

  return dates.map((date) => {
    const day = actualMap.get(date)
    const spend = day?.spend ?? 0
    const deliverableValue =
      deliverableKey && deliverableKey !== "deliverable_value"
        ? (day as any)?.[deliverableKey] ?? 0
        : day?.deliverable_value ?? (day as any)?.results ?? 0

    return {
      date,
      expectedSpend: 0,
      actualSpend: Number(spend.toFixed(2)),
      expectedDeliverable: 0,
      actualDeliverable: Number(deliverableValue.toFixed(2)),
    }
  })
}


function buildAggregatedMetrics(
  lineItemMetrics: SocialLineMetrics[],
  asAtDate: string | undefined,
  campaignStartISO: string,
  campaignEndISO: string,
  filterRange?: DateRange,
): SocialLineMetrics["pacing"] {
  const cs = parseDateSafe(campaignStartISO)
  const ce = parseDateSafe(campaignEndISO)
  if (!cs || !ce) {
    return {
      asAtDate: asAtDate ?? null,
      spend: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      deliverable: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      series: [],
    }
  }

  let rangeStart = cs
  let rangeEnd = ce
  if (filterRange?.start && filterRange?.end) {
    const fs = startOfDay(filterRange.start)
    const fe = startOfDay(filterRange.end)
    rangeStart = new Date(Math.max(cs.getTime(), fs.getTime()))
    rangeEnd = new Date(Math.min(ce.getTime(), fe.getTime()))
  }
  if (rangeEnd < rangeStart) {
    return {
      asAtDate: asAtDate ?? null,
      spend: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      deliverable: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      series: [],
    }
  }

  const dateRange = eachDay(rangeStart, rangeEnd)

  const actualMap = new Map<string, { spend: number; deliverable: number }>()
  lineItemMetrics.forEach((metric) => {
    metric.actualsDaily.forEach((day) => {
      const deliverableValue = day.deliverable_value ?? (day as any).results ?? 0
      const existing = actualMap.get(day.date) ?? { spend: 0, deliverable: 0 }
      actualMap.set(day.date, {
        spend: existing.spend + (day.spend ?? 0),
        deliverable: existing.deliverable + (deliverableValue ?? 0),
      })
    })
  })

  const aggregateActuals = dateRange.map((date) => {
    const values = actualMap.get(date) ?? { spend: 0, deliverable: 0 }
    return {
      date,
      spend: Number(values.spend.toFixed(2)),
      impressions: 0,
      clicks: 0,
      results: Number(values.deliverable.toFixed(2)),
      video_3s_views: 0,
      deliverable_value: Number(values.deliverable.toFixed(2)),
    }
  })

  const asAt = asAtDate ?? null
  const delivered = sumDeliveredUpToDate(aggregateActuals, "deliverable_value", asAt)

  const bookedTotals = {
    spend: round2(lineItemMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0)),
    deliverables: round2(
      lineItemMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0)
    ),
  }

  const shouldAt = asAt ?? campaignEndISO
  const windowRange: DateRange =
    filterRange?.start && filterRange?.end ? { start: rangeStart, end: rangeEnd } : { start: null, end: null }

  const shouldSpend = round2(
    windowRange.start && windowRange.end
      ? lineItemMetrics.reduce(
          (sum, m) => sum + expectedInWindowFromBursts(m.bursts, windowRange, "spend"),
          0,
        )
      : lineItemMetrics.reduce(
          (sum, m) => sum + computeShouldToDateFromBursts(m.bursts, shouldAt, "spend"),
          0,
        ),
  )
  const shouldDeliverables = round2(
    windowRange.start && windowRange.end
      ? lineItemMetrics.reduce(
          (sum, m) => sum + expectedInWindowFromBursts(m.bursts, windowRange, "deliverables"),
          0,
        )
      : lineItemMetrics.reduce(
          (sum, m) =>
            sum + computeShouldToDateFromBursts(m.bursts, shouldAt, "deliverables"),
          0,
        ),
  )

  const spendPacing = shouldSpend > 0 ? (delivered.spend / shouldSpend) * 100 : 0
  const deliverablePacing =
    shouldDeliverables > 0 ? (delivered.deliverables / shouldDeliverables) * 100 : 0

  return {
    asAtDate: asAt ?? null,
    spend: {
      actualToDate: round2(delivered.spend),
      expectedToDate: shouldSpend,
      delta: round2(delivered.spend - shouldSpend),
      pacingPct: round2(spendPacing),
      goalTotal: bookedTotals.spend,
    },
    deliverable: {
      actualToDate: round2(delivered.deliverables),
      expectedToDate: shouldDeliverables,
      delta: round2(delivered.deliverables - shouldDeliverables),
      pacingPct: round2(deliverablePacing),
      goalTotal: bookedTotals.deliverables,
    },
    series: buildCumulativeSeries(dateRange, aggregateActuals, "deliverable_value"),
  }
}

export type ActualKpis = {
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
  cpm: number
  ctr: number
  cvr: number
  cpc: number
  cost_per_result: number
  cpv: number
  view_rate: number
}

export function summarizeActuals(rows: (ActualsDaily | (ActualsDaily & { video3sViews?: number }))[]): ActualKpis {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += row.spend
      acc.impressions += row.impressions
      acc.clicks += row.clicks
      acc.results += row.results
      acc.video_3s_views += (row as any).video_3s_views ?? (row as any).video3sViews ?? 0
      return acc
    },
    { spend: 0, impressions: 0, clicks: 0, results: 0, video_3s_views: 0 }
  )

  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  const cvr = totals.impressions ? (totals.results / totals.impressions) * 100 : 0
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0
  const cost_per_result = totals.results ? totals.spend / totals.results : 0
  const cpv = totals.video_3s_views ? totals.spend / totals.video_3s_views : 0
  const view_rate = totals.impressions
    ? (totals.video_3s_views / totals.impressions) * 100
    : 0

  return {
    ...totals,
    cpm,
    ctr,
    cvr,
    cpc,
    cost_per_result,
    cpv,
    view_rate,
  }
}

function extractLineItemId(item: SocialLineItem): string | null {
  const id = item.line_item_id ?? (item as any).lineItemId ?? (item as any).LINE_ITEM_ID
  return cleanId(id)
}


export function computeSocialLineMetricsForPlatform(input: {
  activeItems: SocialLineItem[]
  socialRows: MetaPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  kpiTargets: KPITargetsMap | undefined
  filterRange: DateRange
  pacingWindow: ReturnType<typeof getPacingWindow>
}): SocialLineMetrics[] {
  const { activeItems, socialRows, campaignStart, campaignEnd, mbaNumber, kpiTargets, filterRange, pacingWindow } =
    input
  const resolvedCampaignStart = campaignStart
  const resolvedCampaignEnd = campaignEnd
    if (!activeItems.length) return []
    const today = startOfDay(new Date())
    const asAtForSummary = parseDateSafe(pacingWindow.asAtISO) ?? today
    const campaignStartD = parseDateSafe(campaignStart)
    const campaignEndD = parseDateSafe(campaignEnd)
    const campaignDayRange =
      campaignStartD && campaignEndD ? eachDay(campaignStartD, campaignEndD) : []

    return activeItems.map((item) => {
      const bursts = item.bursts ?? parseBursts(item.bursts_json)
      const window = getLineItemWindow(bursts, resolvedCampaignStart, resolvedCampaignEnd)
      const targetId = extractLineItemId(item)
      const matches = socialRows.reduce(
        (acc, r) => {
          const rid = getRowLineItemId(r)
          if (!rid || !targetId) return acc
          if (rid === targetId) {
            acc.rows.push(r as MetaPacingRow)
            acc.byId += 1
          }
          return acc
        },
        { rows: [] as MetaPacingRow[], byId: 0 }
      )
      const matchedRows = matches.rows

      const deliverySummary = summariseDelivery(
        matchedRows,
        campaignStart,
        campaignEnd,
        asAtForSummary
      )

      const totalBudget = item.total_budget ?? 0
      const totalDeliverables = item.goal_deliverable_total ?? 0
      const hasSchedule = (bursts ?? []).length > 0
      const fallbackBurst: Burst[] =
        !hasSchedule && window.startISO && window.endISO
          ? [
              {
                start_date: window.startISO,
                end_date: window.endISO,
                media_investment: totalBudget,
                deliverables: totalDeliverables,
                budget_number: totalBudget,
                calculated_value_number: totalDeliverables,
              },
            ]
          : []
      const burstsToUse = hasSchedule ? bursts : fallbackBurst
      const deliverableKey = resolveDeliverableKey(item.buy_type, item.platform)

      const dailyLookup = new Map<string, (typeof deliverySummary.daily)[number]>()
      deliverySummary.daily.forEach((day) => dailyLookup.set(day.dateDay, day))

      const dateRange =
        campaignDayRange.length > 0 ? campaignDayRange : Array.from(dailyLookup.keys()).sort()

      const actualsDaily: (ActualsDaily & { deliverable_value?: number })[] = dateRange.map(
        (date) => {
          const day = dailyLookup.get(date)
          const deliverableValue =
            deliverableKey && deliverableKey !== "deliverable_value"
              ? (day as any)?.[deliverableKey] ?? 0
              : (day as any)?.results ?? 0

          return {
            date,
            spend: day?.amountSpent ?? 0,
            impressions: day?.impressions ?? 0,
            clicks: day?.clicks ?? 0,
            results: day?.results ?? 0,
            video_3s_views: (day as any)?.video3sViews ?? 0,
            deliverable_value: deliverableValue,
          }
        }
      )

      const asAtDate = pacingWindow.asAtISO

      const clippedFilter = clipDateRangeToCampaign(filterRange, campaignStart, campaignEnd)
      const urlWindowActive = Boolean(filterRange.start && filterRange.end)
      const filteredActualsDaily = urlWindowActive
        ? clippedFilter
          ? filterDailySeriesByRange(actualsDaily, clippedFilter)
          : []
        : actualsDaily

      const seriesDates =
        filteredActualsDaily.length > 0
          ? [...new Set(filteredActualsDaily.map((d) => d.date))].sort()
          : urlWindowActive
            ? []
            : dateRange

      const deliveredTotals = urlWindowActive
        ? sumDeliveredFiltered(filteredActualsDaily, deliverableKey ?? "deliverable_value")
        : sumDeliveredUpToDate(
            actualsDaily,
            deliverableKey ?? "deliverable_value",
            asAtDate,
          )
      const booked = sumBookedFromBursts(burstsToUse ?? [])

      const shouldSpend =
        urlWindowActive && clippedFilter
          ? expectedInWindowFromBursts(burstsToUse ?? [], clippedFilter, "spend")
          : urlWindowActive && !clippedFilter
            ? 0
            : computeShouldToDateFromBursts(burstsToUse ?? [], asAtDate, "spend")
      const shouldDeliverables =
        urlWindowActive && clippedFilter
          ? expectedInWindowFromBursts(burstsToUse ?? [], clippedFilter, "deliverables")
          : urlWindowActive && !clippedFilter
            ? 0
            : computeShouldToDateFromBursts(burstsToUse ?? [], asAtDate, "deliverables")

      const pacing: PacingResult = {
        asAtDate,
        spend: {
          actualToDate: round2(deliveredTotals.spend),
          expectedToDate: round2(shouldSpend),
          delta: round2(deliveredTotals.spend - shouldSpend),
          pacingPct: round2(shouldSpend > 0 ? (deliveredTotals.spend / shouldSpend) * 100 : 0),
          goalTotal: round2(booked.spend),
        },
        series: buildCumulativeSeries(
          urlWindowActive ? seriesDates : dateRange,
          urlWindowActive ? filteredActualsDaily : actualsDaily,
          deliverableKey ?? "deliverable_value",
        ),
      }

      if (deliverableKey) {
        pacing.deliverable = {
          actualToDate: round2(deliveredTotals.deliverables),
          expectedToDate: round2(shouldDeliverables),
          delta: round2(deliveredTotals.deliverables - shouldDeliverables),
          pacingPct: round2(
            shouldDeliverables > 0 ? (deliveredTotals.deliverables / shouldDeliverables) * 100 : 0
          ),
          goalTotal: round2(booked.deliverables),
        }
      }

      const targetMetric = targetMetricForDeliverableKey(deliverableKey)
      let targetCurve: TargetCurvePoint[] = []
      let cumulativeActual: Array<{ date: string; actual: number }> = []
      let onTrackStatus: OnTrackStatus = "no-data"

      if (
        targetMetric &&
        kpiTargets &&
        kpiTargets.size > 0 &&
        pacingWindow.campaignStartISO &&
        pacingWindow.campaignEndISO
      ) {
        const tcli = buildSocialTargetCurveLineItem(item, burstsToUse ?? [])
        if (tcli) {
          targetCurve = buildCumulativeTargetCurve({
            campaignStartISO: pacingWindow.campaignStartISO,
            campaignEndISO: pacingWindow.campaignEndISO,
            lineItems: [tcli],
            kpiTargets,
            metric: targetMetric,
            tolerance: 0.15,
          })

          if (clippedFilter?.start && clippedFilter?.end && targetCurve.length) {
            const rs = clippedFilter.start
            const re = clippedFilter.end
            targetCurve = targetCurve.filter((p) => {
              const d = parseDateOnly(p.date)
              if (!d) return true
              return d >= rs && d <= re
            })
          }

          if (targetCurve.length) {
            const dailyActualsByDate = new Map<string, number>()
            for (const row of pacing.series) {
              dailyActualsByDate.set(
                String(row.date),
                Math.max(0, Number(row.actualDeliverable ?? 0) || 0),
              )
            }
            cumulativeActual = buildCumulativeActualSeries(
              targetCurve.map((p) => p.date),
              dailyActualsByDate,
            )
            const cumActualByDate = new Map(cumulativeActual.map((r) => [r.date, r.actual]))
            const asAtEval = pacing.asAtDate ?? getMelbourneTodayISO()
            onTrackStatus = evaluateOnTrack(targetCurve, cumActualByDate, asAtEval)
          }
        }
      }

      return {
        lineItem: item,
        pacing,
        bursts: burstsToUse ?? [],
        window,
        actualsDaily: urlWindowActive ? filteredActualsDaily : actualsDaily,
        matchedRows,
        matchBreakdown: {
          targetId,
          byId: matches.byId,
          platform: normalisePlatform(item.platform),
        },
        booked,
        delivered: {
          spend: round2(deliveredTotals.spend),
          deliverables: round2(deliveredTotals.deliverables),
        },
        shouldToDate: {
          spend: round2(shouldSpend),
          deliverables: round2(shouldDeliverables),
        },
        deliverableKey,
        targetMetric,
        targetCurve,
        cumulativeActual,
        onTrackStatus,
      }
    })
}

export function buildSocialAggregatePacing(
  lineItemMetrics: SocialLineMetrics[],
  asAtISO: string | undefined,
  campaignStartISO: string,
  campaignEndISO: string,
  filterRange?: DateRange,
): SocialLineMetrics["pacing"] {
  return buildAggregatedMetrics(lineItemMetrics, asAtISO, campaignStartISO, campaignEndISO, filterRange)
}

export function buildSocialAggregateTargetCurve(
  lineItemMetrics: SocialLineMetrics[],
  kpiTargets: KPITargetsMap | undefined,
  pacingWindow: ReturnType<typeof getPacingWindow>,
  filterRange: DateRange,
  campaignStart: string,
  campaignEnd: string,
): TargetCurvePoint[] {
  if (!kpiTargets || kpiTargets.size === 0) return []
  if (!lineItemMetrics.length) return []
  if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) return []

  const tclis: TargetCurveLineItem[] = []
  for (const metric of lineItemMetrics) {
    if (!metric.targetMetric) continue
    const tcli = buildSocialTargetCurveLineItem(metric.lineItem, metric.bursts)
    if (tcli) tclis.push(tcli)
  }
  if (!tclis.length) return []

  const metrics = new Set(lineItemMetrics.map((m) => m.targetMetric).filter(Boolean))
  if (metrics.size !== 1) return []
  const sharedMetric = Array.from(metrics)[0] as "clicks" | "views"

  let curve = buildCumulativeTargetCurve({
    campaignStartISO: pacingWindow.campaignStartISO,
    campaignEndISO: pacingWindow.campaignEndISO,
    lineItems: tclis,
    kpiTargets,
    metric: sharedMetric,
    tolerance: 0.15,
  })
  const clipped = clipDateRangeToCampaign(filterRange, campaignStart, campaignEnd)
  if (clipped?.start && clipped?.end && curve.length) {
    const rs = clipped.start
    const re = clipped.end
    curve = curve.filter((p) => {
      const d = parseDateOnly(p.date)
      if (!d) return true
      return d >= rs && d <= re
    })
  }
  return curve
}

export function buildSocialAggregateCumulativeActual(
  aggregateTargetCurve: TargetCurvePoint[],
  aggregatePacing: SocialLineMetrics["pacing"],
): Array<{ date: string; actual: number }> {
  if (!aggregateTargetCurve.length) return []
  const dailyByDate = new Map<string, number>()
  for (const row of aggregatePacing.series) {
    const prev = dailyByDate.get(String(row.date)) ?? 0
    dailyByDate.set(String(row.date), prev + Math.max(0, Number(row.actualDeliverable ?? 0) || 0))
  }
  return buildCumulativeActualSeries(
    aggregateTargetCurve.map((p) => p.date),
    dailyByDate,
  )
}

export function socialAggregateOnTrackStatus(
  aggregateTargetCurve: TargetCurvePoint[],
  aggregateCumulativeActual: Array<{ date: string; actual: number }>,
  aggregatePacing: SocialLineMetrics["pacing"],
): OnTrackStatus {
  if (!aggregateTargetCurve.length) return "no-data"
  const cumActualByDate = new Map(aggregateCumulativeActual.map((r) => [r.date, r.actual]))
  const asAt = aggregatePacing.asAtDate ?? getMelbourneTodayISO()
  return evaluateOnTrack(aggregateTargetCurve, cumActualByDate, asAt)
}
