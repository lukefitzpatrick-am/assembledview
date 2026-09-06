import { formatMoney } from "@/lib/format/money"
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
  extractProgrammaticLineItemId,
  getProgrammaticDeliverableLabel,
  mapCombinedRowToDv360,
  normalizeProgrammaticLineItems,
  summarizeDv360Actuals,
  type ProgrammaticLineItem,
  type ProgrammaticLineItemMetrics,
} from "@/lib/delivery/programmatic/programmaticCompute"
import { snowflakeChannelsForDeliverySource } from "@/lib/delivery/deliverySourceMap"
import {
  type OnTrackStatus,
} from "@/lib/kpi/deliveryTargetCurve"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import { channelMediaTypeColour } from "./channelMediaTypeColour"
import type { ChannelKey, ChannelSectionData, ConnectionPill } from "./types"
import type { DeliveryStatus } from "../shared/statusColours"
import { aggregateDailyRows } from "./aggregateDaily"
import { deliveryLineItemDisplayName } from "@/lib/delivery/lineItemDisplayName"
import { aggregateDeliverableLabel } from "@/lib/delivery/deliverableLabel"
import { groupPacingRowsByPlacement } from "./directDigitalAdapterShared"

const MODELLED_SPEND_LABEL = "Delivered spend (modelled from plan rate)"
const MODELLED_SPEND_TOOLTIP =
  "Rate = planned media ÷ planned deliverables. Capped at the planned total."

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
  return formatMoney(value ?? 0)
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

const DV360_PLATFORMS = new Set(["dv360", "youtube - dv360", "youtube-dv360"])
const TABOOLA_PLATFORMS = new Set(["taboola", "native - taboola", "native"])

function dspConnectionLabel(items: ProgrammaticLineItem[]): string {
  let hasDv360 = false
  let hasTaboola = false
  for (const item of items) {
    const platform = String(item.platform ?? "")
      .trim()
      .toLowerCase()
    if (DV360_PLATFORMS.has(platform)) hasDv360 = true
    if (TABOOLA_PLATFORMS.has(platform)) hasTaboola = true
  }
  if (hasDv360 && hasTaboola) return "DV360 + Taboola connected"
  if (hasTaboola) return "Taboola connected"
  return "DV360 connected"
}

function cm360PartnerLabel(publisherKey: string): string {
  const key = publisherKey.trim().toLowerCase()
  if (key === "quantcast" || key === "quantcast - direct") return "Quantcast"
  return publisherKey.trim() || "CM360"
}

function programmaticConnectionPills(items: ProgrammaticLineItem[]): ConnectionPill[] {
  const dspItems = items.filter((item) => item.deliverySourceMap?.delivery_source === "dsp")
  const cm360Items = items.filter((item) => item.deliverySourceMap?.delivery_source === "cm360")
  const pills: ConnectionPill[] = []
  if (dspItems.length > 0) {
    pills.push({ label: dspConnectionLabel(dspItems), tone: "dv360" })
  }
  const seen = new Set<string>()
  for (const item of cm360Items) {
    const label = `CM360 (${cm360PartnerLabel(item.deliverySourceMap?.publisher_key ?? "")})`
    if (seen.has(label)) continue
    seen.add(label)
    pills.push({ label, tone: "cm360" })
  }
  return pills
}

function mapCombinedRowsForNormalizedLines(
  combinedRows: CombinedPacingRow[],
  normalized: ProgrammaticLineItem[],
  snowflakeChannel: string,
) {
  const byId = new Map<string, ProgrammaticLineItem>()
  for (const item of normalized) {
    const id = extractProgrammaticLineItemId(item)
    if (id) byId.set(id, item)
  }

  return combinedRows.flatMap((row) => {
    const rowId = String(row.lineItemId ?? "").trim().toLowerCase()
    if (!rowId) return []
    const item = byId.get(rowId)
    if (!item) return []
    const source = item.deliverySourceMap?.delivery_source
    if (!source) return []
    const accepted = snowflakeChannelsForDeliverySource(source, snowflakeChannel)
    const channel = String(row.channel ?? "")
    if (!accepted.has(channel)) return []
    return [mapCombinedRowToDv360(row, accepted)]
  })
}

/** CM360 placement grain from combinedRows — Dv360DailyRow drops entityId. */
function cm360PlacementBreakdown(
  lineItem: ProgrammaticLineItem,
  combinedRows: CombinedPacingRow[],
  snowflakeChannel: "programmatic-display" | "programmatic-video",
  knownPlanLineIds: string[],
): LineItemBlockProps["entityBreakdown"] | undefined {
  const source = lineItem.deliverySourceMap?.delivery_source
  if (source !== "cm360") return undefined
  const lineId = extractProgrammaticLineItemId(lineItem)
  if (!lineId) return undefined
  const accepted = snowflakeChannelsForDeliverySource(source, snowflakeChannel)
  const matched = combinedRows.filter((row) => {
    const rowId = String(row.lineItemId ?? "").trim().toLowerCase()
    return rowId === lineId && accepted.has(String(row.channel ?? ""))
  })
  const rows = groupPacingRowsByPlacement(matched)
  if (rows.length === 0) return undefined
  return {
    rows,
    knownPlanLineIds,
    entityNoun: { singular: "placement", plural: "placements" },
    columns: "delivery",
  }
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

  const normalized = normalizeProgrammaticLineItems(rawLineItems)
  if (!normalized.length) return null

  const dvRows = mapCombinedRowsForNormalizedLines(combinedRows, normalized, snowflakeChannel)

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

  const knownPlanLineIds = normalized
    .map((item) => extractProgrammaticLineItemId(item))
    .filter((id): id is string => Boolean(id))

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

  // Channel chrome uses media-type colour; brandColour stays on chart props only (AVU5-4).
  const mediaTypeColour = channelMediaTypeColour(key)
  const accentColour = mediaTypeColour
  const isVideoChannel = snowflakeChannel === "programmatic-video"

  const aggregateTrack = pacingPctToStatus(aggregatePacing.deliverable?.pacingPct)

  const allSpendModelled =
    metrics.length > 0 && metrics.every((m) => m.spendModelledFromPlanRate)

  const summaryChips = [
    { label: allSpendModelled ? MODELLED_SPEND_LABEL : "Total spend", value: formatCurrency2dp(kpisRollup.spend) },
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
    title: allSpendModelled ? MODELLED_SPEND_LABEL : "Spend delivery",
    value: formatCurrency2dp(aggregatePacing.spend.actualToDate),
    detail: `Delivered ${formatCurrency2dp(aggregatePacing.spend.actualToDate)} · Planned ${formatCurrency2dp(bookedTotals.spend)}`,
    progress: spendRatio,
    variance: pctVarianceFromPacingPct(aggregatePacing.spend.pacingPct),
    status: pacingPctToStatus(aggregatePacing.spend.pacingPct),
    sparkline: aggregatePacing.series.map((p) => Number(p.actualSpend ?? 0)),
    ...(allSpendModelled ? { titleTooltip: MODELLED_SPEND_TOOLTIP } : {}),
  }

  const deliverableCard: ProgressCardProps = {
    title: `${aggregateDeliverableLabel(normalized.map((li) => li.buy_type))} delivery`,
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
    const modelled = m.spendModelledFromPlanRate === true
    const displayName = deliveryLineItemDisplayName(li as Record<string, unknown>)
    const entityBreakdown = cm360PlacementBreakdown(
      m.lineItem,
      combinedRows,
      snowflakeChannel,
      knownPlanLineIds,
    )
    const block: LineItemBlockProps = {
      name: displayName.label,
      fullName: displayName.full,
      platform: String(m.lineItem.buy_type ?? ""),
      progressCards: [
        {
          title: modelled ? MODELLED_SPEND_LABEL : "Spend delivery",
          value: formatCurrency2dp(m.pacing.spend.actualToDate),
          detail: `Delivered ${formatCurrency2dp(m.pacing.spend.actualToDate)} · Planned ${formatCurrency2dp(m.booked.spend)}`,
          progress: spendR,
          variance: pctVarianceFromPacingPct(m.pacing.spend.pacingPct),
          status: pacingPctToStatus(m.pacing.spend.pacingPct),
          sparkline: m.pacing.series.map((p) => Number(p.actualSpend ?? 0)),
          dense: true,
          ...(modelled ? { titleTooltip: MODELLED_SPEND_TOOLTIP } : {}),
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
      ...(entityBreakdown ? { entityBreakdown } : {}),
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
    connections: programmaticConnectionPills(normalized),
    mediaTypeColour,
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
