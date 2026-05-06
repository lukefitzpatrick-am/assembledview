import { getMediaColor } from "@/lib/charts/registry"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import { kpiTargetKey } from "@/lib/kpi/deliveryTargets"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import {
  mapCombinedRowToMeta,
  normalizeLineItems,
  classifyPlatform,
  getLineItemNameCandidate,
  computeSocialLineMetricsForPlatform,
  buildSocialAggregatePacing,
  summarizeActuals,
  formatCurrency,
  formatCurrency2dp,
  formatLineItemHeader,
  formatNumber,
  formatWholeNumber,
  getDeliverableLabel,
  type SocialLineItem,
  type SocialLineMetrics,
} from "@/lib/delivery/social/socialChannelCompute"
import { getPacingWindow } from "@/lib/pacing/pacingWindow"
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

function onTrackToDelivery(s: SocialLineMetrics["onTrackStatus"]): DeliveryStatus {
  return s as DeliveryStatus
}

function fmtPct(x: number): string {
  return `${x.toFixed(2)}%`
}

function isVideoBuySocial(lineItems: SocialLineItem[]): boolean {
  return lineItems.some((li) => /\bvideo\b/i.test(String(li.buy_type ?? "")))
}

/** Compare actual vs saved KPI target (same numeric scale as actual). */
function compareRateStatus(actual: number, target: number | undefined, higherIsBetter: boolean): DeliveryStatus {
  if (target === undefined || target <= 0 || !Number.isFinite(actual)) return "no-data"
  const tol = 0.08
  const ratio = higherIsBetter ? actual / target : target / actual
  if (ratio >= 1 + tol) return higherIsBetter ? "ahead" : "behind"
  if (ratio <= 1 - tol) return higherIsBetter ? "behind" : "ahead"
  return "on-track"
}

function resolveKpiTarget(kpiTargets: KPITargetsMap | undefined, publisher: string, bidStrategy: string) {
  if (!kpiTargets?.size) return undefined
  return kpiTargets.get(kpiTargetKey("socialmedia", publisher.toLowerCase().trim(), bidStrategy.toLowerCase().trim()))
}

function buildAggregateKpiTiles(
  kpis: ReturnType<typeof summarizeActuals>,
  kpiTargets: KPITargetsMap | undefined,
  publisher: string,
  bidStrategy: string,
  accentColour: string,
  includeVideoMetrics: boolean,
): KpiTileProps[] {
  const tgt = resolveKpiTarget(kpiTargets, publisher, bidStrategy)

  const tiles: KpiTileProps[] = []

  tiles.push({
    label: "CPM",
    value: formatCurrency2dp(kpis.cpm),
    accentColour,
  })

  tiles.push({
    label: "CTR",
    value: fmtPct(kpis.ctr),
    expected: tgt && tgt.ctr > 0 ? fmtPct(tgt.ctr) : undefined,
    status:
      tgt && tgt.ctr > 0 ? compareRateStatus(kpis.ctr, tgt.ctr, true) : undefined,
    progress:
      tgt && tgt.ctr > 0 ? Math.max(0, Math.min(1, kpis.ctr / tgt.ctr)) : undefined,
    accentColour,
  })

  tiles.push({
    label: "CPC",
    value: formatCurrency2dp(kpis.cpc),
    accentColour,
  })

  tiles.push({
    label: "CVR",
    value: fmtPct(kpis.cvr),
    expected:
      tgt && tgt.conversion_rate > 0 ? fmtPct(tgt.conversion_rate) : undefined,
    status:
      tgt && tgt.conversion_rate > 0
        ? compareRateStatus(kpis.cvr, tgt.conversion_rate, true)
        : undefined,
    progress:
      tgt && tgt.conversion_rate > 0
        ? Math.max(0, Math.min(1, kpis.cvr / tgt.conversion_rate))
        : undefined,
    accentColour,
  })

  tiles.push({
    label: "CPA",
    value: formatCurrency2dp(kpis.cost_per_result),
    accentColour,
  })

  if (includeVideoMetrics) {
    tiles.push({
      label: "View rate",
      value: fmtPct(kpis.view_rate),
      expected: tgt && tgt.vtr > 0 ? fmtPct(tgt.vtr) : undefined,
      status: tgt && tgt.vtr > 0 ? compareRateStatus(kpis.view_rate, tgt.vtr, true) : undefined,
      accentColour,
    })
    tiles.push({
      label: "CPV",
      value: formatCurrency2dp(kpis.cpv),
      accentColour,
    })
  }

  return tiles
}

export function buildSocialChannelSectionForPlatform(input: {
  key: ChannelKey
  platform: "meta" | "tiktok"
  title: string
  lineItems: SocialLineItem[]
  snowflakeRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  kpiTargets: KPITargetsMap | undefined
  filterRange: DateRange
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData {
  const {
    key,
    platform,
    title,
    lineItems,
    snowflakeRows,
    campaignStart,
    campaignEnd,
    mbaNumber,
    kpiTargets,
    filterRange,
    brandColour,
    lastSyncedAt,
  } = input

  const wantChannel = platform === "meta" ? "meta" : "tiktok"
  const pacingWindow = getPacingWindow(campaignStart, campaignEnd)
  const normalized = normalizeLineItems(lineItems ?? [])
  const activeItems = normalized.filter(
    (item) => classifyPlatform(item.platform, getLineItemNameCandidate(item)) === platform,
  )

  const platformSnowflake = snowflakeRows.filter(
    (r) => String(r.channel ?? "").toLowerCase() === wantChannel,
  )
  const platformRows = platformSnowflake.map(mapCombinedRowToMeta)

  const metrics = computeSocialLineMetricsForPlatform({
    activeItems,
    socialRows: platformRows,
    campaignStart,
    campaignEnd,
    mbaNumber,
    kpiTargets,
    filterRange,
    pacingWindow,
  })

  const aggregatePacing = buildSocialAggregatePacing(
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

  const aggregateTrack = pacingPctToStatus(aggregatePacing.deliverable?.pacingPct)

  const kpisRaw = summarizeActuals(metrics.flatMap((m) => m.actualsDaily))
  const pub = String(activeItems[0]?.platform ?? "meta")
  const bid = String(activeItems[0]?.buy_type ?? "")

  const accentColour = brandColour ?? getMediaColor("socialmedia")
  const includeVideo = isVideoBuySocial(activeItems)

  const summaryChips = [
    { label: "Total spend", value: formatCurrency(aggregatePacing.spend.actualToDate) },
    { label: "Total impressions", value: formatNumber(kpisRaw.impressions) },
    { label: "Avg CPM", value: formatCurrency2dp(kpisRaw.cpm) },
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
    value: formatCurrency(aggregatePacing.spend.actualToDate),
    detail: `Delivered ${formatCurrency(aggregatePacing.spend.actualToDate)} · Planned ${formatCurrency(bookedTotals.spend)}`,
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
    status: aggregateTrack,
    sparkline: aggregatePacing.series.map((p) => Number(p.actualDeliverable ?? 0)),
  }

  const kpiTiles = buildAggregateKpiTiles(kpisRaw, kpiTargets, pub, bid, accentColour, includeVideo)

  const accordionItems = metrics.map((m) => {
    const liKpis = summarizeActuals(m.actualsDaily)
    const videoLi = /\bvideo\b/i.test(String(m.lineItem.buy_type ?? ""))
    const spendR =
      m.booked.spend > 0 ? Math.max(0, Math.min(1, m.pacing.spend.actualToDate / m.booked.spend)) : 0
    const delR =
      m.booked.deliverables > 0 && m.pacing.deliverable
        ? Math.max(0, Math.min(1, m.pacing.deliverable.actualToDate / m.booked.deliverables))
        : 0

    const block: LineItemBlockProps = {
      name: formatLineItemHeader(m.lineItem),
      platform: String(m.lineItem.buy_type ?? ""),
      progressCards: [
        {
          title: "Spend delivery",
          value: formatCurrency(m.pacing.spend.actualToDate),
          detail: `Delivered ${formatCurrency(m.pacing.spend.actualToDate)} · Planned ${formatCurrency(m.booked.spend)}`,
          progress: spendR,
          variance: pctVarianceFromPacingPct(m.pacing.spend.pacingPct),
          status: pacingPctToStatus(m.pacing.spend.pacingPct),
          sparkline: m.pacing.series.map((p) => Number(p.actualSpend ?? 0)),
          dense: true,
        },
        {
          title: `${getDeliverableLabel(m.deliverableKey)} delivery`,
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
        tiles: buildAggregateKpiTiles(
          liKpis,
          kpiTargets,
          String(m.lineItem.platform ?? "meta"),
          String(m.lineItem.buy_type ?? ""),
          accentColour,
          videoLi,
        ),
      },
      chart: {
        kind: "daily-delivery",
        daily: m.actualsDaily.map((d) => ({
          date: d.date,
          amount_spent: Number(d.spend ?? 0),
          impressions: Number(d.impressions ?? 0),
        })),
        series: [
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
    connections:
      platform === "meta"
        ? [{ label: "Meta connected", tone: "meta" }]
        : [{ label: "TikTok connected", tone: "tiktok" }],
    mediaTypeColour: accentColour,
    aggregate: {
      summaryChips,
      progressCards: [spendCard, deliverableCard],
      kpiBand: {
        title: "Delivery KPIs",
        subtitle: "Impressions, clicks, conversions & views",
        tiles: kpiTiles,
      },
      chart: {
        daily: aggregateDailyRows(
          accordionItems.flatMap((item) => (item.block.chart.kind === "daily-delivery" ? item.block.chart.daily : [])),
          ["amount_spent", "impressions"],
        ),
        series: [
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
