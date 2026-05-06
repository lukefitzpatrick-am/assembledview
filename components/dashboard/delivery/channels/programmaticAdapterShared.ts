import { getMediaColor } from "@/lib/charts/registry"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { clipDateRangeToCampaign, parseDateOnly } from "@/lib/dashboard/dateFilter"
import { kpiTargetKey, type KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import {
  buildProgrammaticAggregatedMetrics,
  buildProgrammaticCampaignDateRange,
  buildProgrammaticLineItemMetrics,
  buildProgrammaticTargetCurveLineItem,
  getProgrammaticDeliverableLabel,
  mapCombinedRowToDv360,
  normalizeDv360ProgrammaticLineItems,
  summarizeDv360Actuals,
  type ProgrammaticLineItem,
  type ProgrammaticLineItemMetrics,
} from "@/lib/delivery/programmatic/programmaticCompute"
import {
  buildCumulativeActualSeries,
  buildCumulativeTargetCurve,
  evaluateOnTrack,
  type OnTrackStatus,
  type TargetCurveLineItem,
  type TargetCurvePoint,
} from "@/lib/kpi/deliveryTargetCurve"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { ChannelKey, ChannelSectionData } from "./types"
import type { DeliveryStatus } from "../shared/statusColours"

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

function onTrackToDelivery(s: OnTrackStatus): DeliveryStatus {
  return s as DeliveryStatus
}

function compareRateStatus(actual: number, target: number | undefined, higherIsBetter: boolean): DeliveryStatus | undefined {
  if (target === undefined || target <= 0 || !Number.isFinite(actual)) return undefined
  const tol = 0.08
  const ratio = higherIsBetter ? actual / target : target / actual
  if (ratio >= 1 + tol) return higherIsBetter ? "ahead" : "behind"
  if (ratio <= 1 - tol) return higherIsBetter ? "behind" : "ahead"
  return "on-track"
}

function formatCurrency2dp(value: number | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

function formatWholeNumber(value: number | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-AU")
}

function fmtPct(x: number): string {
  return `${x.toFixed(2)}%`
}

function resolveKpiTarget(
  kpiTargets: KPITargetsMap | undefined,
  mediaKey: "progdisplay" | "progvideo",
  publisher: string,
  bidStrategy: string,
) {
  if (!kpiTargets?.size) return undefined
  return kpiTargets.get(kpiTargetKey(mediaKey, publisher.toLowerCase().trim(), bidStrategy.toLowerCase().trim()))
}

function buildAggregateTargetCurve(
  metrics: ProgrammaticLineItemMetrics[],
  kpiTargets: KPITargetsMap | undefined,
  pacingWindow: { campaignStartISO: string; campaignEndISO: string },
  filterRange: DateRange,
  campaignStart: string,
  campaignEnd: string,
  mediaCurveKey: "progdisplay" | "progvideo",
  curveMetric: "clicks" | "views",
): TargetCurvePoint[] {
  if (!kpiTargets || kpiTargets.size === 0) return []
  if (!metrics.length) return []
  if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) return []

  const tclis: TargetCurveLineItem[] = []
  for (const metric of metrics) {
    if (curveMetric === "clicks" && metric.targetMetric !== "clicks") continue
    if (curveMetric === "views" && metric.targetMetric !== "views") continue
    const tcli = buildProgrammaticTargetCurveLineItem(metric.lineItem, metric.bursts, mediaCurveKey)
    if (tcli) tclis.push(tcli)
  }
  if (!tclis.length) return []

  let curve = buildCumulativeTargetCurve({
    campaignStartISO: pacingWindow.campaignStartISO,
    campaignEndISO: pacingWindow.campaignEndISO,
    lineItems: tclis,
    kpiTargets,
    metric: curveMetric,
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

function buildAggregateCumulativeActual(
  aggregateCurve: TargetCurvePoint[],
  metrics: ProgrammaticLineItemMetrics[],
  curveMetric: "clicks" | "views",
): Array<{ date: string; actual: number }> {
  if (!aggregateCurve.length) return []
  const dailyByDate = new Map<string, number>()
  for (const metric of metrics) {
    if (curveMetric === "clicks" && metric.targetMetric !== "clicks") continue
    if (curveMetric === "views" && metric.targetMetric !== "views") continue
    for (const row of metric.actualsDaily) {
      const dateKey = String((row as { date?: string; day?: string }).date ?? (row as { day?: string }).day ?? "")
      if (!dateKey) continue
      const value =
        curveMetric === "clicks"
          ? Number((row as { clicks?: number }).clicks ?? 0)
          : Number((row as { videoViews?: number }).videoViews ?? 0)
      const prev = dailyByDate.get(dateKey) ?? 0
      dailyByDate.set(dateKey, prev + (Number(value) || 0))
    }
  }
  return buildCumulativeActualSeries(
    aggregateCurve.map((p) => p.date),
    dailyByDate,
  )
}

export function buildProgrammaticChannelSection(input: {
  key: ChannelKey
  title: string
  snowflakeChannel: "programmatic-display" | "programmatic-video"
  mediaCurveKey: "progdisplay" | "progvideo"
  curveMetric: "clicks" | "views"
  rawLineItems: unknown[] | undefined
  combinedRows: CombinedPacingRow[]
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
    key,
    title,
    snowflakeChannel,
    mediaCurveKey,
    curveMetric,
    rawLineItems,
    combinedRows,
    campaignStart,
    campaignEnd,
    filterRange,
    kpiTargets,
    pacingWindow,
    brandColour,
    lastSyncedAt,
  } = input

  const normalized = normalizeDv360ProgrammaticLineItems(rawLineItems)
  if (!normalized.length) return null

  const dvRows = combinedRows.filter((r) => r.channel === snowflakeChannel).map(mapCombinedRowToDv360)

  const campaignDateSeries = buildProgrammaticCampaignDateRange(campaignStart, campaignEnd)

  const metrics = buildProgrammaticLineItemMetrics(
    normalized,
    dvRows,
    campaignDateSeries,
    pacingWindow.asAtISO,
    mediaCurveKey,
    kpiTargets,
    {
      startISO: pacingWindow.campaignStartISO,
      endISO: pacingWindow.campaignEndISO,
    },
    campaignStart,
    campaignEnd,
    filterRange,
  )

  const aggregatePacing = buildProgrammaticAggregatedMetrics(
    metrics,
    pacingWindow.asAtISO,
    campaignStart,
    campaignEnd,
    filterRange,
  )

  const bookedTotals = {
    spend: metrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0),
    deliverables: metrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0),
  }

  const kpisRollup = summarizeDv360Actuals(
    metrics.flatMap((m) =>
      m.actualsDaily.map((d) => ({
        spend: d.spend,
        impressions: d.impressions,
        clicks: d.clicks,
        conversions: d.conversions,
        videoViews: d.videoViews,
      })),
    ),
  )

  const pub = String((normalized[0] as { platform?: string })?.platform ?? "dv360")
  const bid = String((normalized[0] as { buy_type?: string })?.buy_type ?? "")
  const tgt = resolveKpiTarget(kpiTargets, mediaCurveKey, pub, bid)

  const accentColour = brandColour ?? getMediaColor("programmatic")

  const aggregateCurve = buildAggregateTargetCurve(
    metrics,
    kpiTargets,
    pacingWindow,
    filterRange,
    campaignStart,
    campaignEnd,
    mediaCurveKey,
    curveMetric,
  )
  const aggregateCumulativeActual = buildAggregateCumulativeActual(aggregateCurve, metrics, curveMetric)
  const cumActualByDate = new Map(aggregateCumulativeActual.map((r) => [r.date, r.actual]))
  const asAt = aggregatePacing.asAtDate ?? getMelbourneTodayISO()
  const aggregateTrack = aggregateCurve.length ? evaluateOnTrack(aggregateCurve, cumActualByDate, asAt) : "no-data"

  const summaryChips = [
    { label: "Total spend", value: formatCurrency2dp(kpisRollup.spend) },
    { label: "Total impressions", value: formatWholeNumber(kpisRollup.impressions) },
    { label: "Avg CPM", value: formatCurrency2dp(kpisRollup.cpm) },
    {
      label: "Avg delivery",
      value: `${(
        metrics.reduce((s, m) => s + Number(m.pacing.spend.pacingPct ?? 0), 0) / Math.max(1, metrics.length)
      ).toFixed(1)}%`,
    },
  ]

  const spendRatio =
    bookedTotals.spend > 0 ? Math.max(0, Math.min(1, aggregatePacing.spend.actualToDate / bookedTotals.spend)) : 0
  const delRatio =
    bookedTotals.deliverables > 0 && aggregatePacing.deliverable
      ? Math.max(0, Math.min(1, aggregatePacing.deliverable.actualToDate / bookedTotals.deliverables))
      : 0

  const spendCard: ProgressCardProps = {
    title: "Spend delivery",
    value: formatCurrency2dp(aggregatePacing.spend.actualToDate),
    detail: `Delivered ${formatCurrency2dp(aggregatePacing.spend.actualToDate)} · Planned ${formatCurrency2dp(bookedTotals.spend)}`,
    progress: spendRatio,
    variance: pctVarianceFromPacingPct(aggregatePacing.spend.pacingPct),
    status: pacingPctToStatus(aggregatePacing.spend.pacingPct),
    sparkline: aggregatePacing.series.map((p) => Number(p.actualSpend ?? 0)),
  }

  const deliverableCard: ProgressCardProps = {
    title: "Deliverable delivery",
    value: formatWholeNumber(aggregatePacing.deliverable?.actualToDate ?? 0),
    detail: `Delivered ${formatWholeNumber(aggregatePacing.deliverable?.actualToDate ?? 0)} · Planned ${formatWholeNumber(bookedTotals.deliverables)}`,
    progress: delRatio,
    variance: pctVarianceFromPacingPct(aggregatePacing.deliverable?.pacingPct),
    status: onTrackToDelivery(aggregateTrack),
    sparkline: aggregatePacing.series.map((p) => Number(p.actualDeliverable ?? 0)),
  }

  const kpiTilesDisplay: KpiTileProps[] = [
    {
      label: "CPM",
      value: formatCurrency2dp(kpisRollup.cpm),
      accentColour,
    },
    {
      label: "CTR",
      value: fmtPct(kpisRollup.ctr),
      expected: tgt && tgt.ctr > 0 ? fmtPct(tgt.ctr) : undefined,
      status: tgt && tgt.ctr > 0 ? compareRateStatus(kpisRollup.ctr, tgt.ctr, true) : undefined,
      progress: tgt && tgt.ctr > 0 ? Math.max(0, Math.min(1, kpisRollup.ctr / tgt.ctr)) : undefined,
      accentColour,
    },
    {
      label: "CPC",
      value: formatCurrency2dp(kpisRollup.cpc),
      accentColour,
    },
    {
      label: "CPA",
      value: formatCurrency2dp(kpisRollup.cpa),
      accentColour,
    },
  ]

  const kpiTilesVideo: KpiTileProps[] = [
    {
      label: "CPM",
      value: formatCurrency2dp(kpisRollup.cpm),
      accentColour,
    },
    {
      label: "View rate",
      value: fmtPct(kpisRollup.viewRate),
      expected: tgt && tgt.vtr > 0 ? fmtPct(tgt.vtr) : undefined,
      status: tgt && tgt.vtr > 0 ? compareRateStatus(kpisRollup.viewRate, tgt.vtr, true) : undefined,
      progress: tgt && tgt.vtr > 0 ? Math.max(0, Math.min(1, kpisRollup.viewRate / tgt.vtr)) : undefined,
      accentColour,
    },
    {
      label: "CPV",
      value: formatCurrency2dp(kpisRollup.cpv),
      accentColour,
    },
    {
      label: "CTR",
      value: fmtPct(kpisRollup.ctr),
      expected: tgt && tgt.ctr > 0 ? fmtPct(tgt.ctr) : undefined,
      status: tgt && tgt.ctr > 0 ? compareRateStatus(kpisRollup.ctr, tgt.ctr, true) : undefined,
      progress: tgt && tgt.ctr > 0 ? Math.max(0, Math.min(1, kpisRollup.ctr / tgt.ctr)) : undefined,
      accentColour,
    },
  ]

  const deliverableLabelAggregate =
    curveMetric === "views" ? "Video views" : curveMetric === "clicks" ? "Clicks" : "Deliverables"

  const accordionItems = metrics.map((m) => {
    const liKpis = summarizeDv360Actuals(
      m.actualsDaily.map((d) => ({
        spend: d.spend,
        impressions: d.impressions,
        clicks: d.clicks,
        conversions: d.conversions,
        videoViews: d.videoViews,
      })),
    )
    const pubLi = String(m.lineItem.platform ?? "dv360")
    const bidLi = String(m.lineItem.buy_type ?? "")
    const tgtLi = resolveKpiTarget(kpiTargets, mediaCurveKey, pubLi, bidLi)

    const spendR =
      m.booked.spend > 0 ? Math.max(0, Math.min(1, m.pacing.spend.actualToDate / m.booked.spend)) : 0
    const delR =
      m.booked.deliverables > 0 && m.pacing.deliverable
        ? Math.max(0, Math.min(1, m.pacing.deliverable.actualToDate / m.booked.deliverables))
        : 0

    const kpiBandTiles: KpiTileProps[] =
      snowflakeChannel === "programmatic-video"
        ? [
            {
              label: "CPM",
              value: formatCurrency2dp(liKpis.cpm),
              accentColour,
            },
            {
              label: "View rate",
              value: fmtPct(liKpis.viewRate),
              expected: tgtLi && tgtLi.vtr > 0 ? fmtPct(tgtLi.vtr) : undefined,
              status: tgtLi && tgtLi.vtr > 0 ? compareRateStatus(liKpis.viewRate, tgtLi.vtr, true) : undefined,
              progress: tgtLi && tgtLi.vtr > 0 ? Math.max(0, Math.min(1, liKpis.viewRate / tgtLi.vtr)) : undefined,
              accentColour,
            },
            {
              label: "CPV",
              value: formatCurrency2dp(liKpis.cpv),
              accentColour,
            },
            {
              label: "CTR",
              value: fmtPct(liKpis.ctr),
              expected: tgtLi && tgtLi.ctr > 0 ? fmtPct(tgtLi.ctr) : undefined,
              status: tgtLi && tgtLi.ctr > 0 ? compareRateStatus(liKpis.ctr, tgtLi.ctr, true) : undefined,
              progress: tgtLi && tgtLi.ctr > 0 ? Math.max(0, Math.min(1, liKpis.ctr / tgtLi.ctr)) : undefined,
              accentColour,
            },
          ]
        : [
            {
              label: "CPM",
              value: formatCurrency2dp(liKpis.cpm),
              accentColour,
            },
            {
              label: "CTR",
              value: fmtPct(liKpis.ctr),
              expected: tgtLi && tgtLi.ctr > 0 ? fmtPct(tgtLi.ctr) : undefined,
              status: tgtLi && tgtLi.ctr > 0 ? compareRateStatus(liKpis.ctr, tgtLi.ctr, true) : undefined,
              progress: tgtLi && tgtLi.ctr > 0 ? Math.max(0, Math.min(1, liKpis.ctr / tgtLi.ctr)) : undefined,
              accentColour,
            },
            {
              label: "CPC",
              value: formatCurrency2dp(liKpis.cpc),
              accentColour,
            },
            {
              label: "CPA",
              value: formatCurrency2dp(liKpis.cpa),
              accentColour,
            },
          ]

    const li = m.lineItem as ProgrammaticLineItem & {
      line_item_name?: string
      lineItemName?: string
    }
    const isVideoLine = snowflakeChannel === "programmatic-video"
    const dailyRows = m.actualsDaily.map((d) => ({
      date: d.date,
      amount_spent: Number(d.spend ?? 0),
      ...(isVideoLine
        ? { video_3s_views: Number(d.videoViews ?? 0) }
        : { impressions: Number(d.impressions ?? 0) }),
    }))
    const block: LineItemBlockProps = {
      name: String(li.line_item_name ?? li.lineItemName ?? li.line_item_id ?? "Line item"),
      platform: String(m.lineItem.buy_type ?? ""),
      progressCards: [
        {
          title: "Spend delivery",
          value: formatCurrency2dp(m.pacing.spend.actualToDate),
          detail: `Delivered ${formatCurrency2dp(m.pacing.spend.actualToDate)} · Planned ${formatCurrency2dp(m.booked.spend)}`,
          progress: spendR,
          variance: pctVarianceFromPacingPct(m.pacing.spend.pacingPct),
          status: pacingPctToStatus(m.pacing.spend.pacingPct),
          sparkline: m.pacing.series.map((p) => Number(p.actualSpend ?? 0)),
          dense: true,
        },
        {
          title: `${getProgrammaticDeliverableLabel(m.deliverableKey)} delivery`,
          value: formatWholeNumber(m.pacing.deliverable?.actualToDate ?? 0),
          detail: `Delivered ${formatWholeNumber(m.pacing.deliverable?.actualToDate ?? 0)} · Planned ${formatWholeNumber(m.booked.deliverables)}`,
          progress: delR,
          variance: pctVarianceFromPacingPct(m.pacing.deliverable?.pacingPct),
          status: onTrackToDelivery(m.onTrackStatus),
          sparkline: m.pacing.series.map((p) => Number(p.actualDeliverable ?? 0)),
          dense: true,
        },
      ],
      kpiBand: {
        title: "Delivery KPIs",
        tiles: kpiBandTiles,
      },
      chart: {
        kind: "daily-delivery",
        daily: dailyRows,
        series: isVideoLine
          ? [
              { key: "amount_spent", label: "Spend" },
              { key: "video_3s_views", label: "Views" },
            ]
          : [
              { key: "amount_spent", label: "Spend" },
              { key: "impressions", label: "Impressions" },
            ],
        asAtDate: m.pacing.asAtDate,
        brandColour,
      },
    }

    return {
      id: String(m.lineItem.line_item_id),
      block,
    }
  })

  return {
    key,
    title,
    dateRange: { startISO: campaignStart, endISO: campaignEnd },
    lastSyncedAt,
    connections: [{ label: "DV360 connected", tone: "dv360" }],
    mediaTypeColour: accentColour,
    aggregate: {
      summaryChips,
      progressCards: [spendCard, deliverableCard],
      kpiBand: {
        title: "Delivery KPIs",
        subtitle: snowflakeChannel === "programmatic-video" ? "Video efficiency & engagement" : "Display efficiency",
        tiles: snowflakeChannel === "programmatic-video" ? kpiTilesVideo : kpiTilesDisplay,
      },
      chart: {
        kind: "cumulative-vs-target",
        targetCurve: aggregateCurve,
        cumulativeActual: aggregateCumulativeActual,
        asAtDate: aggregatePacing.asAtDate,
        deliverableLabel: deliverableLabelAggregate,
        brandColour,
      },
    },
    lineItems: accordionItems,
  }
}
