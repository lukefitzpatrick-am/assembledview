import { formatMoney } from "@/lib/format/money"
import { getDeterministicColor, getMediaColor } from "@/lib/charts/registry"
import { channelMediaTypeColour } from "./channelMediaTypeColour"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import { clipDateRangeToCampaign, type DateRange } from "@/lib/dashboard/dateFilter"
import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget"
import { applyKpiBandTargetsFromPlan } from "@/lib/kpi/kpiBandTargets"
import { aggregateRatioTargetFromLineItems, getLineItemKpiRow } from "@/lib/kpi/lineItemKpiTargets"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { SearchPacingAdGroupRow, SearchPacingLineItemSeries, SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"
import {
  aggregateDailyTotals,
  buildSearchScheduleByLineItem,
  computeSearchTotalDerived,
  computeSearchTotalSchedule,
  computeSearchTotalsKpis,
  computeToDateFromBursts,
  fillDailySeries,
  resolveSearchFillRange,
  safeDiv,
  searchExpectedInWindow,
} from "@/lib/delivery/search/searchCore"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { ChannelSectionData } from "./types"
import type { DeliveryStatus } from "../shared/statusColours"
import { aggregateDailyRows } from "./aggregateDaily"
import { lineDatesFromBursts } from "@/lib/delivery/lineChartWindow"
import { SEARCH_CHART_SERIES } from "./channelChartSeries"
import {
  aggregateDeliverableLabel,
  deliverableLabelForBuyType,
} from "@/lib/delivery/deliverableLabel"
import { parseMoney } from "@/lib/money"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import {
  expectedForWindow,
  netSpendBasisForLine,
  pacingAsAtISO,
  paceVsExpected,
  plannedTotal,
  resolvePacingWindow,
  sumInWindow,
  type PacingWindow,
} from "@/lib/pacing/expectedForWindow"
import { paceProgressCard } from "../shared/paceProgressCard"
import type { ChannelPacingInputs } from "./linePace"
import { parseBursts as parseSearchBursts } from "@/lib/delivery/search/searchCore"

const searchSeriesPalette = {
  cost: getMediaColor("search"),
  clicks: getDeterministicColor("pacing_search_clicks"),
  conversions: getDeterministicColor("pacing_search_conversions"),
} as const

function formatCurrency(value: number | null | undefined) {
  return formatMoney(Number(value ?? 0))
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

function searchLineItemIdSources(searchLineItems: unknown[] | undefined): Array<{ line_item_id: string }> {
  const items = Array.isArray(searchLineItems) ? searchLineItems : []
  return items.flatMap((item) => {
    const row = item as Record<string, unknown>
    const lid = String(row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID ?? "")
      .trim()
    return lid ? [{ line_item_id: lid }] : []
  })
}

/** Same clicks-goal rule as `buildSearchScheduleByLineItem`. */
function searchIncludesClicksGoal(buyType: string): boolean {
  return buyType === "cpc" || buyType === "bonus" || buyType.includes("cpc")
}

/**
 * Search plan bursts on Sydney civil days, with the clicks goal as the
 * deliverable (zero for non-CPC lines; budget ÷ buy amount when no clicks are stored).
 */
function searchPacingBursts(raw: unknown, buyType: string) {
  const includeClicksGoal = searchIncludesClicksGoal(buyType)
  return parseSearchBursts(raw).flatMap((b) => {
    const parsed = parseBurstsToNormalised([b])[0]
    if (!parsed) return []
    const rec = (b && typeof b === "object" ? b : {}) as Record<string, unknown>
    const buyAmount =
      parseMoney(rec.buy_amount ?? rec.buyAmount ?? rec.buy_amount_number ?? rec.buyAmountNumber) ?? 0
    let clicks = includeClicksGoal ? parsed.calculatedValue : 0
    if (includeClicksGoal && clicks === 0 && parsed.budget > 0 && buyAmount > 0) clicks = parsed.budget / buyAmount
    return [{ ...parsed, calculatedValue: clicks }]
  })
}

type SearchLinePlan = {
  id: string
  bursts: ReturnType<typeof searchPacingBursts>
  basis: ReturnType<typeof netSpendBasisForLine>
}

function searchLinePlans(
  searchLineItems: unknown[] | undefined,
  pacing: ChannelPacingInputs,
): Map<string, SearchLinePlan> {
  const out = new Map<string, SearchLinePlan>()
  for (const item of Array.isArray(searchLineItems) ? searchLineItems : []) {
    const row = item as Record<string, unknown>
    const id = String(row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID ?? "")
      .trim()
      .toLowerCase()
    if (!id || out.has(id)) continue
    const buyType = String(row?.buy_type ?? row?.buyType ?? "")
      .trim()
      .toLowerCase()
    out.set(id, {
      id,
      bursts: searchPacingBursts(row?.bursts ?? row?.bursts_json ?? row?.burstsJson, buyType),
      basis: netSpendBasisForLine(row, {
        mediaType: "search",
        feePctsByVersionId: pacing.feePctsByVersionId,
        fallbackVersionId: pacing.estimateVersionId,
      }),
    })
  }
  return out
}

function planFigures(plan: SearchLinePlan | undefined, window: PacingWindow, toDate: PacingWindow) {
  if (!plan) {
    return {
      spend: { expected: 0, expectedToDate: 0, planned: 0 },
      clicks: { expected: 0, expectedToDate: 0, planned: 0 },
    }
  }
  return {
    spend: {
      expected: expectedForWindow(plan.bursts, "spend", window, plan.basis),
      expectedToDate: expectedForWindow(plan.bursts, "spend", toDate, plan.basis),
      planned: plannedTotal(plan.bursts, "spend", plan.basis),
    },
    clicks: {
      expected: expectedForWindow(plan.bursts, "deliverables", window),
      expectedToDate: expectedForWindow(plan.bursts, "deliverables", toDate),
      planned: plannedTotal(plan.bursts, "deliverables"),
    },
  }
}

export function buildSearchSection(input: {
  title?: string
  searchLineItems: unknown[] | undefined
  searchData: SearchPacingResponse | null | undefined
  campaignStart: string
  campaignEnd: string
  filterRange: DateRange
  kpiTargets: KPITargetsMap | undefined
  mbaNumber: string
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI> | undefined
  pacingWindow: {
    asAtISO: string
    campaignStartISO: string
    campaignEndISO: string
  }
  brandColour?: string
  lastSyncedAt: Date | null
  isAdmin?: boolean
} & ChannelPacingInputs): ChannelSectionData | null {
  const {
    title = "Search",
    searchLineItems,
    searchData,
    campaignStart,
    campaignEnd,
    filterRange,
    kpiTargets,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    pacingWindow,
    brandColour,
    lastSyncedAt,
    isAdmin = false,
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

  // Pacing compares delivered with what was expected for the selected window
  // (to date = Melbourne yesterday). Charts keep running to today.
  const asAtISO = input.pacingAsAtISO ?? pacingAsAtISO(campaignEnd)
  const window = resolvePacingWindow({
    filterRange,
    campaignStartISO: campaignStart,
    campaignEndISO: campaignEnd,
    asAtISO,
  })
  const toDate = resolvePacingWindow({ campaignStartISO: campaignStart, campaignEndISO: campaignEnd, asAtISO })
  const linePlans = searchLinePlans(searchLineItems, input)
  const channelPlan = [...linePlans.values()].reduce(
    (acc, plan) => {
      const f = planFigures(plan, window, toDate)
      return {
        spend: {
          expected: acc.spend.expected + f.spend.expected,
          expectedToDate: acc.spend.expectedToDate + f.spend.expectedToDate,
          planned: acc.spend.planned + f.spend.planned,
        },
        clicks: {
          expected: acc.clicks.expected + f.clicks.expected,
          expectedToDate: acc.clicks.expectedToDate + f.clicks.expectedToDate,
          planned: acc.clicks.planned + f.clicks.planned,
        },
      }
    },
    planFigures(undefined, window, toDate),
  )
  const deliveredSpend = sumInWindow(daily, window, (d) => Number(d.cost ?? 0))
  const deliveredClicks = sumInWindow(daily, window, (d) => Number(d.clicks ?? 0))

  // Channel chrome uses media-type colour; brandColour stays on chart props only (AVU5-4).
  // searchSeriesPalette.cost === getMediaColor("search") — confirmed equal; keep palette for series accents.
  const mediaTypeColour = channelMediaTypeColour("search")
  const accentColour = mediaTypeColour

  const avgDeliveryPct = (() => {
    const pcts = [
      paceVsExpected(deliveredSpend, channelPlan.spend.expected).pct,
      paceVsExpected(deliveredClicks, channelPlan.clicks.expected).pct,
    ].filter((pct): pct is number => typeof pct === "number")
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : undefined
  })()

  const summaryChips = [
    { label: "Total spend", value: formatCurrency(deliveredSpend) },
    { label: "Total impressions", value: formatWholeNumber(totals.impressions) },
    {
      label: "Avg CPM",
      value:
        totals.impressions > 0 ? formatCurrency2dp((totals.cost / totals.impressions) * 1000) : "—",
    },
    { label: "Avg delivery", value: avgDeliveryPct == null ? "—" : `${avgDeliveryPct.toFixed(1)}%` },
  ]

  const spendCard: ProgressCardProps = paceProgressCard({
    title: "Spend delivery",
    delivered: deliveredSpend,
    expected: channelPlan.spend.expected,
    expectedToDate: channelPlan.spend.expectedToDate,
    plannedTotal: channelPlan.spend.planned,
    window,
    format: (v) => formatCurrency(v),
    sparkline: daily.map((d) => Number(d.cost ?? 0)),
  })

  const deliverableCard: ProgressCardProps = paceProgressCard({
    title: `${aggregateDeliverableLabel(
      Array.from(scheduleByLineItemId.values()).map((s) => s.buyType),
    )} delivery`,
    delivered: deliveredClicks,
    expected: channelPlan.clicks.expected,
    expectedToDate: channelPlan.clicks.expectedToDate,
    plannedTotal: channelPlan.clicks.planned,
    window,
    format: (v) => formatWholeNumber(v),
    sparkline: daily.map((d) => Number(d.clicks ?? 0)),
  })

  const topFrac = topShareFraction(totals.topImpressionPct)

  const items = searchLineItemIdSources(searchLineItems)
  const aggCtrRaw = aggregateRatioTargetFromLineItems(items, lineItemTargets, mbaNumber, kpiVersionNumber, "ctr")
  const aggCvrRaw = aggregateRatioTargetFromLineItems(
    items,
    lineItemTargets,
    mbaNumber,
    kpiVersionNumber,
    "conversion_rate",
  )
  const ctrTargetDec = aggCtrRaw != null && aggCtrRaw > 0 ? normaliseRatioTarget(aggCtrRaw) : null
  const cvrTargetDec = aggCvrRaw != null && aggCvrRaw > 0 ? normaliseRatioTarget(aggCvrRaw) : null

  const actualCtrDec = safeDiv(totals.clicks, totals.impressions)
  const expectedConversions =
    cvrTargetDec !== null
      ? cvrTargetDec * totals.clicks
      : totalDerived.expectedConversions
  const expectedImpressions =
    ctrTargetDec !== null && totalSchedule.clicksExpected > 0
      ? totalSchedule.clicksExpected / ctrTargetDec
      : totalDerived.expectedImpressions

  const ctrTile: KpiTileProps = {
    label: "CTR",
    value: formatPercentAuto(actualCtrDec),
    ...(ctrTargetDec !== null
      ? {
          expected: formatPercentAuto(ctrTargetDec),
          status: compareHigherIsBetter(actualCtrDec ?? 0, ctrTargetDec),
          progress: Math.max(0, Math.min(1, (actualCtrDec ?? 0) / ctrTargetDec)),
        }
      : {}),
    accentColour: searchSeriesPalette.clicks,
  }

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
    ctrTile,
    {
      label: "Conversions",
      value: formatWholeNumber(totals.conversions),
      expected: expectedConversions !== null ? formatWholeNumber(expectedConversions) : undefined,
      status: compareHigherIsBetter(totals.conversions, expectedConversions ?? undefined),
      progress:
        expectedConversions !== null && expectedConversions > 0
          ? Math.max(0, Math.min(1, totals.conversions / expectedConversions))
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
      expected: expectedImpressions !== null ? formatWholeNumber(expectedImpressions) : undefined,
      status: compareHigherIsBetter(totals.impressions, expectedImpressions ?? undefined),
      progress:
        expectedImpressions !== null && expectedImpressions > 0
          ? Math.max(0, Math.min(1, totals.impressions / expectedImpressions))
          : undefined,
      accentColour,
    },
  ]

  const plannedSpendByLineId: Record<string, number> = {}
  for (const [id, sched] of scheduleByLineItemId) {
    plannedSpendByLineId[id] = sched.bursts.reduce((sum, burst) => sum + burst.budget, 0)
  }
  const bandTiles = applyKpiBandTargetsFromPlan(kpiTiles, {
    key: "search",
    items: Array.isArray(searchLineItems) ? searchLineItems : [],
    plannedSpendByLineId,
    impressions: Number(totals.impressions ?? 0),
    clicks: Number(totals.clicks ?? 0),
    results: Number(totals.conversions ?? 0),
    views: null,
    spend: Number(totals.cost ?? 0),
    lineItemTargets,
    isAdmin,
  })

  const lineItemsPayload = Array.isArray(searchData.lineItems) ? searchData.lineItems : []
  const adGroupsPayload = Array.isArray(searchData.adGroups) ? searchData.adGroups : []
  const knownPlanLineIds = searchLineItemIdSources(searchLineItems).map((r) => r.line_item_id)
  const accordionItems = buildSearchLineItemBlocks({
    lineItems: lineItemsPayload,
    adGroups: adGroupsPayload,
    knownPlanLineIds,
    searchLineItems,
    scheduleByLineItemId,
    filterRange,
    campaignStart,
    campaignEnd,
    pacingWindow,
    kpiTargets,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    dailyFill: { fillStartISO, fillEndISO },
    accentColour,
    brandColour,
    plannedSpendByLineId,
    isAdmin,
    linePlans,
    window,
    toDate,
  })

  return {
    key: "search",
    title,
    dateRange: { startISO: campaignStart, endISO: campaignEnd },
    lastSyncedAt,
    connections: [{ label: "Google Ads connected", tone: "google-ads" }],
    mediaTypeColour,
    aggregate: {
      summaryChips,
      progressCards: [spendCard, deliverableCard],
      kpiBand: {
        title: "Delivery KPIs",
        subtitle: "CPC, CTR, conversions, impression share & volume",
        tiles: bandTiles,
      },
      chart: {
        daily: aggregateDailyRows(
          accordionItems.flatMap((item) => (item.block.chart.kind === "daily-delivery" ? item.block.chart.daily : [])),
          ["cost", "clicks"],
        ),
        series: SEARCH_CHART_SERIES,
        asAtDate: pacingWindow.asAtISO ?? null,
        brandColour,
      },
    },
    lineItems: accordionItems,
  }
}

function buildSearchLineItemBlocks(input: {
  lineItems: SearchPacingLineItemSeries[]
  adGroups: SearchPacingAdGroupRow[]
  knownPlanLineIds: string[]
  searchLineItems: unknown[] | undefined
  scheduleByLineItemId: ReturnType<typeof buildSearchScheduleByLineItem>
  filterRange: DateRange
  campaignStart: string
  campaignEnd: string
  pacingWindow: { asAtISO: string; campaignStartISO: string; campaignEndISO: string }
  kpiTargets: KPITargetsMap | undefined
  mbaNumber: string
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI> | undefined
  dailyFill: { fillStartISO: string; fillEndISO: string }
  accentColour: string
  brandColour?: string
  plannedSpendByLineId: Record<string, number>
  isAdmin: boolean
  linePlans: Map<string, SearchLinePlan>
  window: PacingWindow
  toDate: PacingWindow
}): Array<{ id: string; block: LineItemBlockProps }> {
  const {
    lineItems,
    adGroups,
    knownPlanLineIds,
    searchLineItems,
    scheduleByLineItemId,
    filterRange,
    campaignStart,
    campaignEnd,
    pacingWindow,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    dailyFill,
    accentColour,
    brandColour,
    plannedSpendByLineId,
    isAdmin,
    linePlans,
    window,
    toDate,
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

      const liCtr = safeDiv(liTotals.clicks, liTotals.impressions)
      const liCvr = safeDiv(liTotals.conversions, liTotals.clicks)
      const liActualCpc = safeDiv(liTotals.cost, liTotals.clicks)
      const liBurstCpc = safeDiv(spendExpected, clicksExpected)

      const kpiRow = getLineItemKpiRow(lineItemTargets, mbaNumber, kpiVersionNumber, id)
      const ctrTargetDec =
        kpiRow?.ctr != null && kpiRow.ctr > 0 ? normaliseRatioTarget(kpiRow.ctr) : null
      const cvrTargetDec =
        kpiRow?.conversion_rate != null && kpiRow.conversion_rate > 0
          ? normaliseRatioTarget(kpiRow.conversion_rate)
          : null

      const liExpectedConversions =
        cvrTargetDec !== null
          ? cvrTargetDec * liTotals.clicks
          : clicksExpected > 0 && liCvr !== null
            ? clicksExpected * liCvr
            : null
      const liExpectedImpressions =
        ctrTargetDec !== null && clicksExpected > 0
          ? clicksExpected / ctrTargetDec
          : clicksExpected > 0 && liCtr !== null && liCtr > 0
            ? clicksExpected / liCtr
            : null

      const TOP_SHARE_TARGET = 0.5
      const liTopFrac = topShareFraction(liTotals.topImpressionPct)

      const plan = planFigures(linePlans.get(id), window, toDate)
      const liDeliveredSpend = sumInWindow(filled, window, (d) => Number(d.cost ?? 0))
      const liDeliveredClicks = sumInWindow(filled, window, (d) => Number(d.clicks ?? 0))

      const dailyRows = filled.map((d) => ({
        date: d.date,
        cost: Number(d.cost ?? 0),
        clicks: Number(d.clicks ?? 0),
      }))

      const liCtrTile: KpiTileProps = {
        label: "CTR",
        value: formatPercentAuto(liCtr),
        ...(ctrTargetDec !== null
          ? {
              expected: formatPercentAuto(ctrTargetDec),
              status: compareHigherIsBetter(liCtr ?? 0, ctrTargetDec),
              progress: Math.max(0, Math.min(1, (liCtr ?? 0) / ctrTargetDec)),
            }
          : {}),
        accentColour: searchSeriesPalette.clicks,
      }

      const lineAdGroups = adGroups
        .filter((g) => String(g.lineItemId ?? "").trim().toLowerCase() === id)
        .map((g) => ({
          name: g.name,
          spend: Number(g.totals?.cost ?? 0),
          clicks: Number(g.totals?.clicks ?? 0),
          impressions: Number(g.totals?.impressions ?? 0),
        }))

      const block: LineItemBlockProps = {
        name: String(li.lineItemName ?? li.lineItemId),
        platform: schedule?.buyType ? String(schedule.buyType) : undefined,
        progressCards: [
          paceProgressCard({
            title: "Spend delivery",
            delivered: liDeliveredSpend,
            expected: plan.spend.expected,
            expectedToDate: plan.spend.expectedToDate,
            plannedTotal: plan.spend.planned,
            window,
            format: (v) => formatCurrency(v),
            sparkline: filled.map((d) => Number(d.cost ?? 0)),
            dense: true,
          }),
          paceProgressCard({
            title: `${deliverableLabelForBuyType(schedule?.buyType)} delivery`,
            delivered: liDeliveredClicks,
            expected: plan.clicks.expected,
            expectedToDate: plan.clicks.expectedToDate,
            plannedTotal: plan.clicks.planned,
            window,
            format: (v) => formatWholeNumber(v),
            sparkline: filled.map((d) => Number(d.clicks ?? 0)),
            dense: true,
          }),
        ],
        kpiBand: {
          title: "Delivery KPIs",
          tiles: applyKpiBandTargetsFromPlan(
            [
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
            liCtrTile,
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
            {
              key: "search",
              items: (Array.isArray(searchLineItems) ? searchLineItems : []).filter((item) => {
                const rec = item as Record<string, unknown>
                return String(rec.line_item_id ?? rec.lineItemId ?? rec.LINE_ITEM_ID ?? "")
                  .trim()
                  .toLowerCase() === id
              }),
              plannedSpendByLineId,
              impressions: Number(liTotals.impressions ?? 0),
              clicks: Number(liTotals.clicks ?? 0),
              results: Number(liTotals.conversions ?? 0),
              views: null,
              spend: Number(liTotals.cost ?? 0),
              lineItemTargets,
              isAdmin,
            },
          ),
        },
        chart: {
          kind: "daily-delivery",
          daily: dailyRows,
          series: SEARCH_CHART_SERIES,
          asAtDate: pacingWindow.asAtISO ?? null,
          brandColour,
          lineDates: lineDatesFromBursts(
            bursts.map((b) => ({ start_date: b.startISO, end_date: b.endISO })),
            { startISO: campaignStart, endISO: campaignEnd },
          ),
        },
        ...(lineAdGroups.length > 0
          ? {
              entityBreakdown: {
                rows: lineAdGroups,
                knownPlanLineIds,
                entityNoun: { singular: "ad group", plural: "ad groups" },
                columns: "spend" as const,
              },
            }
          : {}),
      }

      return { id, block }
    })
    .filter((x): x is { id: string; block: LineItemBlockProps } => Boolean(x))
}
