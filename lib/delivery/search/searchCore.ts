/**
 * Pure search delivery helpers (from SearchDeliveryContainer).
 */
import {
  buildCumulativeActualSeries,
  buildCumulativeTargetCurve,
  evaluateOnTrack,
  type OnTrackStatus,
  type TargetCurveLineItem,
  type TargetCurvePoint,
} from "@/lib/kpi/deliveryTargetCurve"
import { clipDateRangeToCampaign, parseDateOnly, type DateRange } from "@/lib/dashboard/dateFilter"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { SearchPacingDailyRow, SearchPacingTotals } from "@/lib/snowflake/search-pacing-service"

export type SearchApiDailyRow = SearchPacingDailyRow
export type SearchApiTotals = SearchPacingTotals

function parseAmountSafe(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""))
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  return n / d
}

export function parseISODateOnlyOrNull(value: unknown): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function dateToYMDLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function aggregateDailyTotals(rows: SearchApiDailyRow[]): SearchApiTotals {
  const acc = rows.reduce(
    (a, row) => {
      const imp = Number(row.impressions ?? 0)
      const top = row.topImpressionPct
      return {
        cost: a.cost + Number(row.cost ?? 0),
        clicks: a.clicks + Number(row.clicks ?? 0),
        conversions: a.conversions + Number(row.conversions ?? 0),
        revenue: a.revenue + Number(row.revenue ?? 0),
        impressions: a.impressions + imp,
        _topWeighted: a._topWeighted + (top !== null && top !== undefined ? top * imp : 0),
        _topWeight: a._topWeight + (top !== null && top !== undefined ? imp : 0),
      }
    },
    {
      cost: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      impressions: 0,
      _topWeighted: 0,
      _topWeight: 0,
    },
  )
  return {
    cost: acc.cost,
    clicks: acc.clicks,
    conversions: acc.conversions,
    revenue: acc.revenue,
    impressions: acc.impressions,
    topImpressionPct: acc._topWeight > 0 ? acc._topWeighted / acc._topWeight : null,
  }
}

export function daysInclusive(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`)
  const end = new Date(`${endISO}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1)
}

export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function buildDateListISO(startISO: string, endISO: string): string[] {
  if (!startISO || !endISO || endISO < startISO) return []
  const days = daysInclusive(startISO, endISO)
  if (days <= 0) return []
  const out: string[] = []
  for (let i = 0; i < days; i++) out.push(addDaysISO(startISO, i))
  return out
}

export function fillDailySeries(
  daily: SearchApiDailyRow[],
  startISO: string,
  endISO: string,
): SearchApiDailyRow[] {
  const list = buildDateListISO(startISO, endISO)
  if (!list.length) return Array.isArray(daily) ? daily : []
  const map = new Map<string, SearchApiDailyRow>()
  ;(Array.isArray(daily) ? daily : []).forEach((row) => {
    const key = String(row?.date ?? "").slice(0, 10)
    if (key) map.set(key, row)
  })
  return list.map((date) => {
    const existing = map.get(date)
    if (existing) {
      return {
        date,
        cost: Number(existing.cost ?? 0),
        clicks: Number(existing.clicks ?? 0),
        conversions: Number(existing.conversions ?? 0),
        revenue: Number(existing.revenue ?? 0),
        impressions: Number(existing.impressions ?? 0),
        topImpressionPct: existing.topImpressionPct ?? null,
      }
    }
    return {
      date,
      cost: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      impressions: 0,
      topImpressionPct: null,
    }
  })
}

export type NormalizedBurst = {
  startISO: string
  endISO: string
  budget: number
  clicksGoal: number
}

export function parseBursts(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).bursts)) {
    return (raw as { bursts: unknown[] }).bursts
  }
  return []
}

export function normalizeBursts(raw: unknown, opts?: { includeClicksGoal?: boolean }): NormalizedBurst[] {
  const includeClicksGoal = opts?.includeClicksGoal === true
  const bursts = parseBursts(raw)
  return bursts
    .map((b) => {
      const bt = b as Record<string, unknown>
      const startISO = parseISODateOnlyOrNull(bt?.start_date ?? bt?.startDate)
      const endISO = parseISODateOnlyOrNull(bt?.end_date ?? bt?.endDate)
      if (!startISO || !endISO) return null

      const budget = parseAmountSafe(
        bt?.media_investment ?? bt?.budget_number ?? bt?.spend ?? bt?.amount ?? bt?.budget,
      )
      const buyAmount = includeClicksGoal
        ? parseAmountSafe(bt?.buy_amount ?? bt?.buyAmount ?? bt?.buy_amount_number ?? bt?.buyAmountNumber)
        : 0

      let clicksGoal = includeClicksGoal
        ? parseAmountSafe(
            bt?.deliverables ??
              bt?.calculated_value_number ??
              bt?.calculatedValue ??
              bt?.calculated_value ??
              bt?.clicks ??
              bt?.deliverable_value,
          )
        : 0

      if (includeClicksGoal && clicksGoal === 0 && budget > 0 && buyAmount > 0) {
        clicksGoal = budget / buyAmount
      }

      return { startISO, endISO, budget, clicksGoal } satisfies NormalizedBurst
    })
    .filter((v): v is NormalizedBurst => Boolean(v))
}

export function computeToDateFromBursts(
  bursts: NormalizedBurst[],
  asAtISO: string,
  field: "budget" | "clicksGoal",
): { bookedTotal: number; expectedToDate: number } {
  const asAt = new Date(`${asAtISO}T00:00:00Z`)
  if (Number.isNaN(asAt.getTime())) return { bookedTotal: 0, expectedToDate: 0 }

  let bookedTotal = 0
  let expectedToDate = 0

  for (const burst of bursts) {
    const total = field === "budget" ? burst.budget : burst.clicksGoal
    bookedTotal += total

    const burstStart = new Date(`${burst.startISO}T00:00:00Z`)
    const burstEnd = new Date(`${burst.endISO}T00:00:00Z`)
    if (Number.isNaN(burstStart.getTime()) || Number.isNaN(burstEnd.getTime())) continue

    if (asAt < burstStart) continue

    const windowEnd = asAt > burstEnd ? burst.endISO : asAtISO
    const totalDays = daysInclusive(burst.startISO, burst.endISO)
    const elapsedDays = daysInclusive(burst.startISO, windowEnd)
    if (totalDays <= 0 || elapsedDays <= 0) continue

    expectedToDate += total * Math.min(1, Math.max(0, elapsedDays / totalDays))
  }

  return { bookedTotal, expectedToDate }
}

export function searchExpectedInWindow(
  bursts: NormalizedBurst[],
  range: DateRange,
  field: "budget" | "clicksGoal",
): number {
  if (!range.start || !range.end) return 0
  const startISO = dateToYMDLocal(range.start)
  const endISO = dateToYMDLocal(range.end)
  const beforeISO = addDaysISO(startISO, -1)
  const ce = computeToDateFromBursts(bursts, endISO, field).expectedToDate
  const cb = computeToDateFromBursts(bursts, beforeISO, field).expectedToDate
  return Math.max(0, ce - cb)
}

export type ScheduleByLineItemId = Map<string, { buyType: string; bursts: NormalizedBurst[] }>

export function buildSearchScheduleByLineItem(searchLineItems: unknown[] | undefined): ScheduleByLineItemId {
  const items = Array.isArray(searchLineItems) ? searchLineItems : []
  const map: ScheduleByLineItemId = new Map()
  items.forEach((item) => {
    const row = item as Record<string, unknown>
    const id = String(row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID ?? "")
      .trim()
      .toLowerCase()
    if (!id) return
    const buyType = String(row?.buy_type ?? row?.buyType ?? "")
      .trim()
      .toLowerCase()
    const includeClicksGoal = buyType === "cpc" || buyType === "bonus" || buyType.includes("cpc")

    const burstsPrimary = normalizeBursts(row?.bursts ?? row?.bursts_json ?? row?.burstsJson, {
      includeClicksGoal,
    })
    const burstsFallback = burstsPrimary.length ? burstsPrimary : normalizeBursts(row?.bursts_json, { includeClicksGoal })

    map.set(id, { buyType, bursts: burstsFallback })
  })
  return map
}

export function computeSearchTotalSchedule(input: {
  scheduleByLineItemId: ScheduleByLineItemId
  asAtISO: string
  filterRange: DateRange
  campaignStart: string
  campaignEnd: string
}): {
  budgetBooked: number
  budgetExpected: number
  clicksBooked: number
  clicksExpected: number
} {
  const { scheduleByLineItemId, asAtISO, filterRange, campaignStart, campaignEnd } = input
  const ids = Array.from(scheduleByLineItemId.keys())
  let budgetBooked = 0
  let budgetExpected = 0
  let clicksBooked = 0
  let clicksExpected = 0

  const clipped = clipDateRangeToCampaign(filterRange, campaignStart, campaignEnd)

  ids.forEach((id) => {
    const bursts = scheduleByLineItemId.get(id)?.bursts ?? []
    const spend = computeToDateFromBursts(bursts, asAtISO, "budget")
    const clicks = computeToDateFromBursts(bursts, asAtISO, "clicksGoal")
    budgetBooked += spend.bookedTotal
    clicksBooked += clicks.bookedTotal
    if (filterRange.start && filterRange.end && clipped) {
      budgetExpected += searchExpectedInWindow(bursts, clipped, "budget")
      clicksExpected += searchExpectedInWindow(bursts, clipped, "clicksGoal")
    } else {
      budgetExpected += spend.expectedToDate
      clicksExpected += clicks.expectedToDate
    }
  })

  return { budgetBooked, budgetExpected, clicksBooked, clicksExpected }
}

export function computeSearchTotalsKpis(totals: SearchApiTotals) {
  const ctr = safeDiv(totals.clicks, totals.impressions)
  const cvr = safeDiv(totals.conversions, totals.clicks)
  const cpc = safeDiv(totals.cost, totals.clicks)
  const topShare = totals.topImpressionPct
  return { ctr, cvr, cpc, topShare }
}

export function computeSearchTotalDerived(input: {
  totalSchedule: ReturnType<typeof computeSearchTotalSchedule>
  totals: SearchApiTotals
  totalsKpis: ReturnType<typeof computeSearchTotalsKpis>
}) {
  const { totalSchedule, totals, totalsKpis } = input
  const spendExpected = totalSchedule.budgetExpected
  const clicksExpected = totalSchedule.clicksExpected

  const budgetPacingPct = spendExpected > 0 ? (totals.cost / spendExpected) * 100 : undefined
  const clicksPacingPct = clicksExpected > 0 ? (totals.clicks / clicksExpected) * 100 : undefined

  const expectedCpc = safeDiv(spendExpected, clicksExpected)
  const actualCpc = safeDiv(totals.cost, totals.clicks)
  const cpcPacingPct =
    expectedCpc !== null && actualCpc !== null && actualCpc > 0 ? (expectedCpc / actualCpc) * 100 : undefined

  const expectedConversions =
    clicksExpected > 0 && totalsKpis.cvr !== null ? clicksExpected * totalsKpis.cvr : null
  const conversionsPacingPct =
    expectedConversions !== null && expectedConversions > 0 ? (totals.conversions / expectedConversions) * 100 : undefined

  const expectedImpressions =
    clicksExpected > 0 && totalsKpis.ctr !== null && totalsKpis.ctr > 0 ? clicksExpected / totalsKpis.ctr : null
  const impressionsPacingPct =
    expectedImpressions !== null && expectedImpressions > 0 ? (totals.impressions / expectedImpressions) * 100 : undefined

  const TOP_SHARE_TARGET = 0.5
  const topSharePct = totals.topImpressionPct ?? null
  const topSharePacingPct =
    topSharePct !== null && TOP_SHARE_TARGET > 0 ? (topSharePct / TOP_SHARE_TARGET) * 100 : undefined

  return {
    budgetPacingPct,
    clicksPacingPct,
    expectedCpc,
    actualCpc,
    cpcPacingPct,
    expectedConversions,
    conversionsPacingPct,
    expectedImpressions,
    impressionsPacingPct,
    topSharePacingPct,
  }
}

export function resolveSearchFillRange(
  campaignStart: string,
  campaignEnd: string,
  filterRange: DateRange,
): { fillStartISO: string; fillEndISO: string } {
  const ws = parseISODateOnlyOrNull(campaignStart) ?? campaignStart
  const we = parseISODateOnlyOrNull(campaignEnd) ?? campaignEnd
  if (!filterRange.start || !filterRange.end) {
    return { fillStartISO: ws, fillEndISO: we }
  }
  const clipped = clipDateRangeToCampaign(filterRange, campaignStart, campaignEnd)
  if (!clipped?.start || !clipped?.end) {
    return { fillStartISO: we, fillEndISO: ws }
  }
  return {
    fillStartISO: dateToYMDLocal(clipped.start),
    fillEndISO: dateToYMDLocal(clipped.end),
  }
}

export function buildSearchTargetCurveLineItems(
  searchLineItems: unknown[] | undefined,
  scheduleByLineItemId: ScheduleByLineItemId,
): TargetCurveLineItem[] {
  const items = Array.isArray(searchLineItems) ? searchLineItems : []
  return items
    .map((item): TargetCurveLineItem | null => {
      const row = item as Record<string, unknown>
      const id = String(row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID ?? "")
        .trim()
        .toLowerCase()
      if (!id) return null
      const scheduled = scheduleByLineItemId.get(id)
      const bursts = scheduled?.bursts ?? []
      const buyType = scheduled?.buyType ?? ""

      let earliestStartISO: string | null = null
      let latestEndISO: string | null = null
      for (const b of bursts) {
        if (!earliestStartISO || b.startISO < earliestStartISO) earliestStartISO = b.startISO
        if (!latestEndISO || b.endISO > latestEndISO) latestEndISO = b.endISO
      }

      const deliverables = bursts.reduce((sum, b) => sum + (Number(b.clicksGoal) || 0), 0)

      const publisher = String(row?.platform ?? row?.site ?? row?.publisher ?? "")
        .trim()
        .toLowerCase()
      const bidStrategy = String(row?.bid_strategy ?? row?.bidStrategy ?? buyType ?? "")
        .trim()
        .toLowerCase()

      return {
        mediaType: "search",
        publisher,
        bidStrategy,
        buyType,
        deliverables,
        earliestStartISO,
        latestEndISO,
      }
    })
    .filter((x): x is TargetCurveLineItem => x !== null)
}

export function buildSearchAggregateTargetCurve(input: {
  kpiTargets: KPITargetsMap | undefined
  campaignStartISO: string
  campaignEndISO: string
  lineItems: TargetCurveLineItem[]
  filterRange: DateRange
  campaignStart: string
  campaignEnd: string
}): TargetCurvePoint[] {
  const { kpiTargets, campaignStartISO, campaignEndISO, lineItems, filterRange, campaignStart, campaignEnd } = input
  if (!kpiTargets || kpiTargets.size === 0) return []
  if (!lineItems.length) return []
  let curve = buildCumulativeTargetCurve({
    campaignStartISO,
    campaignEndISO,
    lineItems,
    kpiTargets,
    metric: "clicks",
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

export function buildSearchCumulativeActualForCurve(
  targetCurve: TargetCurvePoint[],
  dailyClicksByDate: Map<string, number>,
): Array<{ date: string; actual: number }> {
  const dates = targetCurve.map((p) => p.date)
  if (dates.length === 0) return []
  return buildCumulativeActualSeries(dates, dailyClicksByDate)
}

export function searchOnTrackStatus(
  targetCurve: TargetCurvePoint[],
  cumulativeActual: Array<{ date: string; actual: number }>,
  refLineISO: string,
): OnTrackStatus {
  if (!targetCurve.length) return "no-data"
  const cumulativeActualByDate = new Map(cumulativeActual.map((r) => [r.date, r.actual]))
  return evaluateOnTrack(targetCurve, cumulativeActualByDate, refLineISO)
}

export function buildDailyClicksMapFromSpendSeries(chartClicksSpend: Array<{ date: string; clicks: number }>) {
  const m = new Map<string, number>()
  for (const row of chartClicksSpend) {
    m.set(row.date, Number(row.clicks) || 0)
  }
  return m
}

export function defaultRefLineISO(asAtISO: string | undefined): string {
  return asAtISO || getMelbourneTodayISO()
}
