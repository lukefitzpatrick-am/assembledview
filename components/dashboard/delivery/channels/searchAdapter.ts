import { getDeterministicColor, getMediaColor } from "@/lib/charts/registry"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import { clipDateRangeToCampaign, type DateRange } from "@/lib/dashboard/dateFilter"
import type { SearchPacingLineItemSeries, SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"
import {
  aggregateDailyTotals,
  buildDailyClicksMapFromSpendSeries,
  buildSearchAggregateTargetCurve,
  buildSearchCumulativeActualForCurve,
  buildSearchScheduleByLineItem,
  buildSearchTargetCurveLineItems,
  computeSearchTotalDerived,
  computeSearchTotalSchedule,
  computeSearchTotalsKpis,
  computeToDateFromBursts,
  defaultRefLineISO,
  fillDailySeries,
  resolveSearchFillRange,
  safeDiv,
  searchExpectedInWindow,
  searchOnTrackStatus,
} from "@/lib/delivery/search/searchCore"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { ChannelSectionData } from "./types"
import type { DeliveryStatus } from "../shared/statusColours"

const searchSeriesPalette = {
  cost: getMediaColor("search"),
  clicks: getDeterministicColor("pacing_search_clicks"),
  conversions: getDeterministicColor("pacing_search_conversions"),
} as const

function pctVarianceFromPacingPct(pct: number | undefined): number {
  if (pct === undefined || Number.isNaN(pct)) return 0
  return (pct - 100) / 100
}

function pacingPctToStatus(pct: number | undefined): DeliveryStatus {
  if (pct === undefined || Number.isNaN(pct)) return "no-data"
  if (pct >= 102) return "ahead"
  if (pct <= 98) return "behind"
  return "on-track"
}

function onTrackToDelivery(s: string): DeliveryStatus {
  return s as DeliveryStatus
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))
}

function formatCurrency2dp(value: number | null | undefined) {
  return formatCurrency(value)
}

function formatWholeNumber(value: number | null | undefined) {
  return Math.round(Number(value ?? 0)).toLocaleString("en-AU")
}

function formatPercentAuto(value: number | null | undefined, digits: number = 2) {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(digits)}%`
}

/** Lower actual CPC vs expected target => ahead when expected/actual is high */
function compareCpcStatus(actual: number, expected: number | undefined): DeliveryStatus | undefined {
  if (expected === undefined || expected <= 0 || !Number.isFinite(actual)) return undefined
  const tol = 0.08
  const ratio = expected / actual
  if (ratio >= 1 + tol) return "ahead"
  if (ratio <= 1 - tol) return "behind"
  return "on-track"
}

function compareHigherIsBetter(actual: number, expected: number | undefined): DeliveryStatus | undefined {
  if (expected === undefined || expected <= 0 || !Number.isFinite(actual)) return undefined
  const tol = 0.08
  const ratio = actual / expected
  if (ratio >= 1 + tol) return "ahead"
  if (ratio <= 1 - tol) return "behind"
  return "on-track"
}

/** Normalise API top-impression share to 0–1 for benchmarks */
function topShareFraction(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return value > 1 ? value / 100 : value
}

export function buildSearchSection(input: {
  title?: string
  searchLineItems: unknown[] | undefined
  searchData: SearchPacingResponse | null | undefined
  campaignStart: string
  campaignEnd: string
  filterRange: DateRange
  kpiTargets: KPITargetsMap | undefined
  pacingWindow: {
    asAtISO: string
    campaignStartISO: string
    campaignEndISO: string
  }
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData | null {
  const {
    title = "Search",
    searchLineItems,
    searchData,
    campaignStart,
    campaignEnd,
    filterRange,
    kpiTargets,
    pacingWindow,
    brandColour,
    lastSyncedAt,
  } = input

  if (!searchData || (searchData as { error?: string }).error) return null

  const apiTotals = searchData.totals
  const rawDaily = Array.isArray(searchData.daily) ? searchData.daily : []
  const { fillStartISO, fillEndISO } = resolveSearchFillRange(campaignStart, campaignEnd, filterRange)

  const daily = fillDailySeries(rawDaily, fillStartISO, fillEndISO)

  const totals =
    filterRange.start && filterRange.end ? aggregateDailyTotals(daily) : apiTotals

  const scheduleByLineItemId = buildSearchScheduleByLineItem(searchLineItems)

  const totalSchedule = computeSearchTotalSchedule({
    scheduleByLineItemId,
    asAtISO: pacingWindow.asAtISO,
    filterRange,
    campaignStart,
    campaignEnd,
  })

  const totalsKpis = computeSearchTotalsKpis(totals)
  const totalDerived = computeSearchTotalDerived({ totalSchedule, totals, totalsKpis })

  const chartClicksSpend = daily.map((d) => ({
    date: d.date,
    clicks: Number(d.clicks ?? 0),
    cost: Number(d.cost ?? 0),
  }))

  const refLineISO = defaultRefLineISO(pacingWindow.asAtISO)

  const targetCurveLineItems = buildSearchTargetCurveLineItems(searchLineItems, scheduleByLineItemId)
  const targetCurve = buildSearchAggregateTargetCurve({
    kpiTargets,
    campaignStartISO: pacingWindow.campaignStartISO,
    campaignEndISO: pacingWindow.campaignEndISO,
    lineItems: targetCurveLineItems,
    filterRange,
    campaignStart,
    campaignEnd,
  })

  const dailyClicksByDate = buildDailyClicksMapFromSpendSeries(chartClicksSpend)
  const cumulativeActual = buildSearchCumulativeActualForCurve(targetCurve, dailyClicksByDate)
  const aggregateTrack = searchOnTrackStatus(targetCurve, cumulativeActual, refLineISO)

  const accentColour = brandColour ?? searchSeriesPalette.cost

  const avgDeliveryPct =
    ((typeof totalDerived.budgetPacingPct === "number" ? totalDerived.budgetPacingPct : 0) +
      (typeof totalDerived.clicksPacingPct === "number" ? totalDerived.clicksPacingPct : 0)) /
    2

  const summaryChips = [
    { label: "Total spend", value: formatCurrency(totals.cost) },
    { label: "Total impressions", value: formatWholeNumber(totals.impressions) },
    {
      label: "Avg CPM",
      value:
        totals.impressions > 0 ? formatCurrency2dp((totals.cost / totals.impressions) * 1000) : "—",
    },
    { label: "Avg delivery", value: `${avgDeliveryPct.toFixed(1)}%` },
  ]

  const spendRatio =
    totalSchedule.budgetBooked > 0 ? Math.max(0, Math.min(1, totals.cost / totalSchedule.budgetBooked)) : 0
  const clicksRatio =
    totalSchedule.clicksBooked > 0 ? Math.max(0, Math.min(1, totals.clicks / totalSchedule.clicksBooked)) : 0

  const spendCard: ProgressCardProps = {
    title: "Spend delivery",
    value: formatCurrency(totals.cost),
    detail: `Delivered ${formatCurrency(totals.cost)} · Planned ${formatCurrency(totalSchedule.budgetBooked)}`,
    progress: spendRatio,
    variance: pctVarianceFromPacingPct(totalDerived.budgetPacingPct),
    status: pacingPctToStatus(totalDerived.budgetPacingPct),
    sparkline: daily.map((d) => Number(d.cost ?? 0)),
  }

  const deliverableCard: ProgressCardProps = {
    title: "Deliverable delivery",
    value: formatWholeNumber(totals.clicks),
    detail: `Delivered ${formatWholeNumber(totals.clicks)} · Planned ${formatWholeNumber(totalSchedule.clicksBooked)}`,
    progress: clicksRatio,
    variance: pctVarianceFromPacingPct(totalDerived.clicksPacingPct),
    status: onTrackToDelivery(aggregateTrack),
    sparkline: daily.map((d) => Number(d.clicks ?? 0)),
  }

  const topFrac = topShareFraction(totals.topImpressionPct)

  const kpiTiles: KpiTileProps[] = [
    {
      label: "CPC",
      value: formatCurrency2dp(totalDerived.actualCpc ?? 0),
      expected: totalDerived.expectedCpc !== null ? formatCurrency2dp(totalDerived.expectedCpc) : undefined,
      status: compareCpcStatus(totalDerived.actualCpc ?? 0, totalDerived.expectedCpc ?? undefined),
      progress:
        totalDerived.expectedCpc !== null &&
        totalDerived.actualCpc !== null &&
        totalDerived.actualCpc > 0
          ? Math.max(0, Math.min(1, totalDerived.expectedCpc / totalDerived.actualCpc))
          : undefined,
      accentColour: searchSeriesPalette.clicks,
    },
    {
      label: "Conversions",
      value: formatWholeNumber(totals.conversions),
      expected:
        totalDerived.expectedConversions !== null ? formatWholeNumber(totalDerived.expectedConversions) : undefined,
      status: compareHigherIsBetter(totals.conversions, totalDerived.expectedConversions ?? undefined),
      progress:
        totalDerived.expectedConversions !== null && totalDerived.expectedConversions > 0
          ? Math.max(0, Math.min(1, totals.conversions / totalDerived.expectedConversions))
          : undefined,
      accentColour: searchSeriesPalette.conversions,
    },
    {
      label: "Top Impression Share",
      value: formatPercentAuto(totals.topImpressionPct, 2),
      expected: "50.00%",
      status: compareHigherIsBetter(topFrac, 0.5),
      progress: Math.max(0, Math.min(1, topFrac / 0.5)),
      accentColour,
    },
    {
      label: "Impressions",
      value: formatWholeNumber(totals.impressions),
      expected:
        totalDerived.expectedImpressions !== null ? formatWholeNumber(totalDerived.expectedImpressions) : undefined,
      status: compareHigherIsBetter(totals.impressions, totalDerived.expectedImpressions ?? undefined),
      progress:
        totalDerived.expectedImpressions !== null && totalDerived.expectedImpressions > 0
          ? Math.max(0, Math.min(1, totals.impressions / totalDerived.expectedImpressions))
          : undefined,
      accentColour,
    },
  ]

  const lineItemsPayload = Array.isArray(searchData.lineItems) ? searchData.lineItems : []
  const accordionItems = buildSearchLineItemBlocks({
    lineItems: lineItemsPayload,
    searchLineItems,
    scheduleByLineItemId,
    filterRange,
    campaignStart,
    campaignEnd,
    pacingWindow,
    kpiTargets,
    dailyFill: { fillStartISO, fillEndISO },
    accentColour,
    brandColour,
  })

  return {
    key: "search",
    title,
    dateRange: { startISO: campaignStart, endISO: campaignEnd },
    lastSyncedAt,
    connections: [{ label: "Google Ads connected", tone: "google-ads" }],
    mediaTypeColour: accentColour,
    aggregate: {
      summaryChips,
      progressCards: [spendCard, deliverableCard],
      kpiBand: {
        title: "Delivery KPIs",
        subtitle: "CPC, conversions, impression share & volume",
        tiles: kpiTiles,
      },
      chart: {
        kind: "cumulative-vs-target",
        targetCurve,
        cumulativeActual,
        asAtDate: pacingWindow.asAtISO ?? null,
        deliverableLabel: "Clicks",
        brandColour,
      },
    },
    lineItems: accordionItems,
  }
}

function findSearchLineItemSource(searchLineItems: unknown[] | undefined, id: string): unknown | undefined {
  const items = Array.isArray(searchLineItems) ? searchLineItems : []
  return items.find((item) => {
    const row = item as Record<string, unknown>
    const lid = String(row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID ?? "")
      .trim()
      .toLowerCase()
    return lid === id
  })
}

function buildSearchLineItemBlocks(input: {
  lineItems: SearchPacingLineItemSeries[]
  searchLineItems: unknown[] | undefined
  scheduleByLineItemId: ReturnType<typeof buildSearchScheduleByLineItem>
  filterRange: DateRange
  campaignStart: string
  campaignEnd: string
  pacingWindow: { asAtISO: string; campaignStartISO: string; campaignEndISO: string }
  kpiTargets: KPITargetsMap | undefined
  dailyFill: { fillStartISO: string; fillEndISO: string }
  accentColour: string
  brandColour?: string
}): Array<{ id: string; block: LineItemBlockProps }> {
  const {
    lineItems,
    searchLineItems,
    scheduleByLineItemId,
    filterRange,
    campaignStart,
    campaignEnd,
    pacingWindow,
    kpiTargets,
    dailyFill,
    accentColour,
    brandColour,
  } = input

  return lineItems
    .map((li) => {
      const id = String(li.lineItemId ?? "").trim().toLowerCase()
      if (!id) return null

      const filled = fillDailySeries(Array.isArray(li.daily) ? li.daily : [], dailyFill.fillStartISO, dailyFill.fillEndISO)
      const liTotals =
        filterRange.start && filterRange.end ? aggregateDailyTotals(filled) : aggregateDailyTotals(Array.isArray(li.daily) ? li.daily : [])

      const schedule = scheduleByLineItemId.get(id)
      const bursts = schedule?.bursts ?? []

      const spendFull = computeToDateFromBursts(bursts, pacingWindow.asAtISO, "budget")
      const clicksFull = computeToDateFromBursts(bursts, pacingWindow.asAtISO, "clicksGoal")

      let spendExpected = spendFull.expectedToDate
      let clicksExpected = clicksFull.expectedToDate
      if (filterRange.start && filterRange.end) {
        const win = clipDateRangeToCampaign(filterRange, campaignStart, campaignEnd)
        if (win?.start && win?.end) {
          spendExpected = searchExpectedInWindow(bursts, win, "budget")
          clicksExpected = searchExpectedInWindow(bursts, win, "clicksGoal")
        }
      }

      const budgetPacingPct = spendExpected > 0 ? (liTotals.cost / spendExpected) * 100 : undefined
      const clicksPacingPct = clicksExpected > 0 ? (liTotals.clicks / clicksExpected) * 100 : undefined

      const liCtr = safeDiv(liTotals.clicks, liTotals.impressions)
      const liCvr = safeDiv(liTotals.conversions, liTotals.clicks)
      const liActualCpc = safeDiv(liTotals.cost, liTotals.clicks)
      const liBurstCpc = safeDiv(spendExpected, clicksExpected)

      const liExpectedConversions = clicksExpected > 0 && liCvr !== null ? clicksExpected * liCvr : null
      const liExpectedImpressions =
        clicksExpected > 0 && liCtr !== null && liCtr > 0 ? clicksExpected / liCtr : null

      const TOP_SHARE_TARGET = 0.5
      const liTopFrac = topShareFraction(liTotals.topImpressionPct)

      const spendR = spendFull.bookedTotal > 0 ? Math.max(0, Math.min(1, liTotals.cost / spendFull.bookedTotal)) : 0
      const delR = clicksFull.bookedTotal > 0 ? Math.max(0, Math.min(1, liTotals.clicks / clicksFull.bookedTotal)) : 0

      const sourceItem = findSearchLineItemSource(searchLineItems, id)
      const singleCurveItems = buildSearchTargetCurveLineItems(
        sourceItem ? [sourceItem] : [],
        scheduleByLineItemId,
      )
      const targetCurve = buildSearchAggregateTargetCurve({
        kpiTargets,
        campaignStartISO: pacingWindow.campaignStartISO,
        campaignEndISO: pacingWindow.campaignEndISO,
        lineItems: singleCurveItems,
        filterRange,
        campaignStart,
        campaignEnd,
      })

      const chartClicksSpend = filled.map((d) => ({
        date: d.date,
        clicks: Number(d.clicks ?? 0),
      }))
      const dailyRows = filled.map((d) => ({
        date: d.date,
        cost: Number(d.cost ?? 0),
        clicks: Number(d.clicks ?? 0),
      }))
      const dailyClicksByDate = buildDailyClicksMapFromSpendSeries(chartClicksSpend)
      const cumulativeActual = buildSearchCumulativeActualForCurve(targetCurve, dailyClicksByDate)
      const lineTrack = searchOnTrackStatus(targetCurve, cumulativeActual, defaultRefLineISO(pacingWindow.asAtISO))

      const block: LineItemBlockProps = {
        name: String(li.lineItemName ?? li.lineItemId),
        platform: schedule?.buyType ? String(schedule.buyType) : undefined,
        progressCards: [
          {
            title: "Spend delivery",
            value: formatCurrency(liTotals.cost),
            detail: `Delivered ${formatCurrency(liTotals.cost)} · Planned ${formatCurrency(spendFull.bookedTotal)}`,
            progress: spendR,
            variance: pctVarianceFromPacingPct(budgetPacingPct),
            status: pacingPctToStatus(budgetPacingPct),
            sparkline: filled.map((d) => Number(d.cost ?? 0)),
            dense: true,
          },
          {
            title: "Deliverable delivery",
            value: formatWholeNumber(liTotals.clicks),
            detail: `Delivered ${formatWholeNumber(liTotals.clicks)} · Planned ${formatWholeNumber(clicksFull.bookedTotal)}`,
            progress: delR,
            variance: pctVarianceFromPacingPct(clicksPacingPct),
            status: onTrackToDelivery(lineTrack),
            sparkline: filled.map((d) => Number(d.clicks ?? 0)),
            dense: true,
          },
        ],
        kpiBand: {
          title: "Delivery KPIs",
          tiles: [
            {
              label: "CPC",
              value: formatCurrency2dp(liActualCpc ?? 0),
              expected: liBurstCpc !== null ? formatCurrency2dp(liBurstCpc) : undefined,
              status: compareCpcStatus(liActualCpc ?? 0, liBurstCpc ?? undefined),
              progress:
                liBurstCpc !== null && liActualCpc !== null && liActualCpc > 0
                  ? Math.max(0, Math.min(1, liBurstCpc / liActualCpc))
                  : undefined,
              accentColour: searchSeriesPalette.clicks,
            },
            {
              label: "Conversions",
              value: formatWholeNumber(liTotals.conversions),
              expected: liExpectedConversions !== null ? formatWholeNumber(liExpectedConversions) : undefined,
              status: compareHigherIsBetter(liTotals.conversions, liExpectedConversions ?? undefined),
              progress:
                liExpectedConversions !== null && liExpectedConversions > 0
                  ? Math.max(0, Math.min(1, liTotals.conversions / liExpectedConversions))
                  : undefined,
              accentColour: searchSeriesPalette.conversions,
            },
            {
              label: "Top Impression Share",
              value: formatPercentAuto(liTotals.topImpressionPct, 2),
              expected: "50.00%",
              status: compareHigherIsBetter(liTopFrac, TOP_SHARE_TARGET),
              progress: Math.max(0, Math.min(1, liTopFrac / TOP_SHARE_TARGET)),
              accentColour,
            },
            {
              label: "Impressions",
              value: formatWholeNumber(liTotals.impressions),
              expected: liExpectedImpressions !== null ? formatWholeNumber(liExpectedImpressions) : undefined,
              status: compareHigherIsBetter(liTotals.impressions, liExpectedImpressions ?? undefined),
              progress:
                liExpectedImpressions !== null && liExpectedImpressions > 0
                  ? Math.max(0, Math.min(1, liTotals.impressions / liExpectedImpressions))
                  : undefined,
              accentColour,
            },
          ],
        },
        chart: {
          kind: "daily-delivery",
          daily: dailyRows,
          series: [
            { key: "cost", label: "Cost" },
            { key: "clicks", label: "Clicks" },
          ],
          asAtDate: pacingWindow.asAtISO ?? null,
          brandColour,
        },
      }

      return { id, block }
    })
    .filter((x): x is { id: string; block: LineItemBlockProps } => Boolean(x))
}
