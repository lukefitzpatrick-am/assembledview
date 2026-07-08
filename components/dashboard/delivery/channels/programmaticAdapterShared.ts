import { getMediaColor } from "@/lib/charts/registry"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { clipDateRangeToCampaign, parseDateOnly } from "@/lib/dashboard/dateFilter"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget"
import {
  aggregateRateTargetFromLineItems,
  aggregateRatioTargetFromLineItems,
  deriveRateTargetFromBursts,
  getLineItemKpiRow,
} from "@/lib/kpi/lineItemKpiTargets"
import type { CampaignKPI } from "@/lib/kpi/types"
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
  type OnTrackStatus,
} from "@/lib/kpi/deliveryTargetCurve"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { ChannelKey, ChannelSectionData } from "./types"
import type { DeliveryStatus } from "../shared/statusColours"
import { aggregateDailyRows } from "./aggregateDaily"

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

function ratioTargetPercentPoints(raw: number | null | undefined): number | undefined {
  if (raw == null || raw <= 0) return undefined
  return normaliseRatioTarget(raw) * 100
}

function burstsForLineItem(lineItem: ProgrammaticLineItem): unknown {
  return lineItem.bursts_json ?? lineItem.bursts ?? null
}

function buildProgrammaticKpiTiles(input: {
  kpis: ReturnType<typeof summarizeDv360Actuals>
  accentColour: string
  isVideo: boolean
  mbaNumber: string
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI> | undefined
  activeItems: ProgrammaticLineItem[]
  lineItem?: ProgrammaticLineItem
}): KpiTileProps[] {
  const {
    kpis,
    accentColour,
    isVideo,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    activeItems,
    lineItem,
  } = input

  const isPerLine = Boolean(lineItem)
  const kpiRow = lineItem
    ? getLineItemKpiRow(lineItemTargets, mbaNumber, kpiVersionNumber, lineItem.line_item_id)
    : undefined

  const ctrRaw = isPerLine
    ? kpiRow?.ctr
    : aggregateRatioTargetFromLineItems(activeItems, lineItemTargets, mbaNumber, kpiVersionNumber, "ctr")
  const vtrRaw = isPerLine
    ? kpiRow?.vtr
    : aggregateRatioTargetFromLineItems(activeItems, lineItemTargets, mbaNumber, kpiVersionNumber, "vtr")

  const ctrTarget = ratioTargetPercentPoints(ctrRaw)
  const vtrTarget = ratioTargetPercentPoints(vtrRaw)

  const cpmExpected = isPerLine
    ? (() => {
        const derived = deriveRateTargetFromBursts(burstsForLineItem(lineItem!), String(lineItem!.buy_type ?? ""))
        return derived?.kind === "cpm" ? derived.value : undefined
      })()
    : (aggregateRateTargetFromLineItems(activeItems, "cpm") ?? undefined)

  const cpvExpected = isPerLine
    ? (() => {
        const derived = deriveRateTargetFromBursts(burstsForLineItem(lineItem!), String(lineItem!.buy_type ?? ""))
        return derived?.kind === "cpv" ? derived.value : undefined
      })()
    : (aggregateRateTargetFromLineItems(activeItems, "cpv") ?? undefined)

  if (isVideo) {
    return [
      {
        label: "CPM",
        value: formatCurrency2dp(kpis.cpm),
        expected: cpmExpected !== undefined ? formatCurrency2dp(cpmExpected) : undefined,
        status: cpmExpected !== undefined ? compareRateStatus(kpis.cpm, cpmExpected, false) : undefined,
        progress:
          cpmExpected !== undefined && cpmExpected > 0
            ? Math.max(0, Math.min(1, cpmExpected / kpis.cpm))
            : undefined,
        accentColour,
      },
      {
        label: "View rate",
        value: fmtPct(kpis.viewRate),
        expected: vtrTarget !== undefined ? fmtPct(vtrTarget) : undefined,
        status:
          vtrTarget !== undefined ? compareRateStatus(kpis.viewRate, vtrTarget, true) : undefined,
        progress:
          vtrTarget !== undefined
            ? Math.max(0, Math.min(1, kpis.viewRate / vtrTarget))
            : undefined,
        accentColour,
      },
      {
        label: "CPV",
        value: formatCurrency2dp(kpis.cpv),
        expected: cpvExpected !== undefined ? formatCurrency2dp(cpvExpected) : undefined,
        status: cpvExpected !== undefined ? compareRateStatus(kpis.cpv, cpvExpected, false) : undefined,
        progress:
          cpvExpected !== undefined && cpvExpected > 0
            ? Math.max(0, Math.min(1, cpvExpected / kpis.cpv))
            : undefined,
        accentColour,
      },
      {
        label: "CTR",
        value: fmtPct(kpis.ctr),
        expected: ctrTarget !== undefined ? fmtPct(ctrTarget) : undefined,
        status:
          ctrTarget !== undefined ? compareRateStatus(kpis.ctr, ctrTarget, true) : undefined,
        progress:
          ctrTarget !== undefined ? Math.max(0, Math.min(1, kpis.ctr / ctrTarget)) : undefined,
        accentColour,
      },
    ]
  }

  return [
    {
      label: "CPM",
      value: formatCurrency2dp(kpis.cpm),
      expected: cpmExpected !== undefined ? formatCurrency2dp(cpmExpected) : undefined,
      status: cpmExpected !== undefined ? compareRateStatus(kpis.cpm, cpmExpected, false) : undefined,
      progress:
        cpmExpected !== undefined && cpmExpected > 0
          ? Math.max(0, Math.min(1, cpmExpected / kpis.cpm))
          : undefined,
      accentColour,
    },
    {
      label: "CTR",
      value: fmtPct(kpis.ctr),
      expected: ctrTarget !== undefined ? fmtPct(ctrTarget) : undefined,
      status:
        ctrTarget !== undefined ? compareRateStatus(kpis.ctr, ctrTarget, true) : undefined,
      progress:
        ctrTarget !== undefined ? Math.max(0, Math.min(1, kpis.ctr / ctrTarget)) : undefined,
      accentColour,
    },
    {
      label: "CPC",
      value: formatCurrency2dp(kpis.cpc),
      accentColour,
    },
    {
      label: "CPA",
      value: formatCurrency2dp(kpis.cpa),
      accentColour,
    },
  ]
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
  mbaNumber: string
  filterRange: DateRange
  kpiVersionNumber: number
  kpiTargets: KPITargetsMap | undefined
  lineItemTargets: Map<string, CampaignKPI> | undefined
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
    mbaNumber,
    filterRange,
    kpiVersionNumber,
    kpiTargets,
    lineItemTargets,
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

  const accentColour = brandColour ?? getMediaColor("programmatic")
  const isVideoChannel = snowflakeChannel === "programmatic-video"

  const aggregateTrack = pacingPctToStatus(aggregatePacing.deliverable?.pacingPct)

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

  const aggregateKpiTiles = buildProgrammaticKpiTiles({
    kpis: kpisRollup,
    accentColour,
    isVideo: isVideoChannel,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    activeItems: normalized,
  })

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

    const spendR =
      m.booked.spend > 0 ? Math.max(0, Math.min(1, m.pacing.spend.actualToDate / m.booked.spend)) : 0
    const delR =
      m.booked.deliverables > 0 && m.pacing.deliverable
        ? Math.max(0, Math.min(1, m.pacing.deliverable.actualToDate / m.booked.deliverables))
        : 0

    const kpiBandTiles = buildProgrammaticKpiTiles({
      kpis: liKpis,
      accentColour,
      isVideo: isVideoChannel,
      mbaNumber,
      kpiVersionNumber,
      lineItemTargets,
      activeItems: normalized,
      lineItem: m.lineItem,
    })

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
              { key: "amount_spent", label: "Spend", yAxis: "left" },
              { key: "video_3s_views", label: "Views", yAxis: "right" },
            ]
          : [
              { key: "amount_spent", label: "Spend", yAxis: "left" },
              { key: "impressions", label: "Impressions", yAxis: "right" },
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
        tiles: aggregateKpiTiles,
      },
      chart: {
        daily: aggregateDailyRows(
          accordionItems.flatMap((item) => (item.block.chart.kind === "daily-delivery" ? item.block.chart.daily : [])),
          snowflakeChannel === "programmatic-video" ? ["amount_spent", "video_3s_views"] : ["amount_spent", "impressions"],
        ),
        series:
          snowflakeChannel === "programmatic-video"
            ? [
                { key: "amount_spent", label: "Spend", yAxis: "left" },
                { key: "video_3s_views", label: "Views", yAxis: "right" },
              ]
            : [
                { key: "amount_spent", label: "Spend", yAxis: "left" },
                { key: "impressions", label: "Impressions", yAxis: "right" },
              ],
        asAtDate: aggregatePacing.asAtDate,
        brandColour,
      },
    },
    lineItems: accordionItems,
  }
}
