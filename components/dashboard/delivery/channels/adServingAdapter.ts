import { getMediaColor } from "@/lib/charts/registry"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { getLineItemKpiRow } from "@/lib/kpi/lineItemKpiTargets"
import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget"
import type { CampaignKPI } from "@/lib/kpi/types"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { DeliveryStatus } from "../shared/statusColours"
import type { ChannelSectionData } from "./types"
import { aggregateDailyRows } from "./aggregateDaily"

type AdServingLineItem = {
  line_item_id?: string
  lineItemId?: string
  LINE_ITEM_ID?: string
  line_item_name?: string
  lineItemName?: string
  buy_type?: string
  platform?: string
  bursts?: unknown
  bursts_json?: unknown
}

type DailyActuals = {
  date: string
  impressions: number
  clicks: number
  results: number
  videoCompletes: number
}

function cleanId(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

function extractLineItemId(item: AdServingLineItem): string | null {
  return cleanId(item.line_item_id ?? item.lineItemId ?? item.LINE_ITEM_ID)
}

function parseBursts(raw: unknown): Array<Record<string, unknown>> {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((b) => b && typeof b === "object") as Array<Record<string, unknown>>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? (parsed.filter((b) => b && typeof b === "object") as Array<Record<string, unknown>>)
        : []
    } catch {
      return []
    }
  }
  return []
}

function burstDeliverables(burst: Record<string, unknown>): number {
  const raw = burst.calculatedValue ?? burst.calculated_value ?? burst.calculated_value_number ?? burst.deliverables
  const n = typeof raw === "number" ? raw : Number(String(raw ?? ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Plan deliverable totals by buy type — impressions for CPM, clicks for CPC. */
function bookedDeliverables(item: AdServingLineItem): { impressions: number; clicks: number } {
  const buy = String(item.buy_type ?? "")
    .trim()
    .toLowerCase()
  const bursts = parseBursts(item.bursts_json ?? item.bursts)
  const total = bursts.reduce((sum, b) => sum + burstDeliverables(b), 0)
  if (buy === "cpc" || buy === "cpa" || buy === "cpl") {
    return { impressions: 0, clicks: total }
  }
  return { impressions: total, clicks: 0 }
}

function formatWholeNumber(value: number | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-AU")
}

function fmtPct(x: number): string {
  if (!Number.isFinite(x)) return "0.00%"
  return `${x.toFixed(2)}%`
}

function safeDiv(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0
  return num / den
}

function pacingPctToStatus(pct: number | undefined): DeliveryStatus {
  if (pct === undefined || Number.isNaN(pct)) return "no-data"
  if (pct >= 102) return "ahead"
  if (pct <= 98) return "behind"
  return "on-track"
}

function pctVarianceFromPacingPct(pct: number | undefined): number {
  if (pct === undefined || Number.isNaN(pct)) return 0
  return (pct - 100) / 100
}

function deliveryProgressCard(input: {
  title: string
  actual: number
  planned: number
  sparkline: number[]
  dense?: boolean
}): ProgressCardProps {
  const { title, actual, planned, sparkline, dense } = input
  const hasGoal = planned > 0
  const progress = hasGoal ? Math.max(0, Math.min(1, safeDiv(actual, planned))) : 0
  const pacingPct = hasGoal ? safeDiv(actual, planned) * 100 : undefined
  return {
    title,
    value: formatWholeNumber(actual),
    detail: hasGoal
      ? `Delivered ${formatWholeNumber(actual)} · Planned ${formatWholeNumber(planned)}`
      : `Delivered ${formatWholeNumber(actual)} · No plan goal`,
    progress,
    variance: hasGoal ? pctVarianceFromPacingPct(pacingPct) : 0,
    varianceLabel: hasGoal ? "vs plan deliverable" : "verification counts only",
    status: hasGoal ? pacingPctToStatus(pacingPct) : "no-data",
    sparkline,
    dense,
  }
}

function normalizeAdServingLineItems(items: unknown[] | undefined): AdServingLineItem[] {
  const arr = Array.isArray(items) ? items : []
  return arr.flatMap((item) => {
    const typed = item as AdServingLineItem
    const id = extractLineItemId(typed)
    if (!id) return []
    return [{ ...typed, line_item_id: id }]
  })
}

/**
 * Zero-spend CM360 verification block. Never surfaces spend pacing, CPM/CPC/CPA,
 * or computeStatus (spend=0 → fake no_delivery).
 */
export function buildAdServingSection(input: {
  adServingLineItems: unknown[] | undefined
  combinedRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  filterRange: DateRange
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI> | undefined
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData | null {
  const {
    adServingLineItems,
    combinedRows,
    campaignStart,
    campaignEnd,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    brandColour,
    lastSyncedAt,
  } = input
  // filterRange reserved for future date-window clipping (parity with other adapters)
  void input.filterRange

  const normalized = normalizeAdServingLineItems(adServingLineItems)
  if (!normalized.length) return null

  const idSet = new Set(normalized.map((i) => i.line_item_id!).filter(Boolean))
  const adRows = combinedRows.filter(
    (r) => r.channel === "ad-serving" && r.lineItemId && idSet.has(String(r.lineItemId).toLowerCase()),
  )
  // No CM360 verification rows for these plan ids → hide the block entirely.
  if (!adRows.length) return null

  const asAtISO = getMelbourneTodayISO()
  const accentColour = brandColour ?? getMediaColor("digital_display")

  const metrics = normalized.map((item) => {
    const id = item.line_item_id!
    const matched = adRows.filter((r) => String(r.lineItemId).toLowerCase() === id)
    const byDate = new Map<string, DailyActuals>()
    for (const row of matched) {
      const date = String(row.dateDay ?? "").slice(0, 10)
      if (!date) continue
      const existing = byDate.get(date) ?? {
        date,
        impressions: 0,
        clicks: 0,
        results: 0,
        videoCompletes: 0,
      }
      byDate.set(date, {
        date,
        impressions: existing.impressions + Number(row.impressions ?? 0),
        clicks: existing.clicks + Number(row.clicks ?? 0),
        results: existing.results + Number(row.results ?? 0),
        videoCompletes: existing.videoCompletes + Number(row.video3sViews ?? 0),
      })
    }
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
    const totals = daily.reduce(
      (acc, d) => ({
        impressions: acc.impressions + d.impressions,
        clicks: acc.clicks + d.clicks,
        results: acc.results + d.results,
        videoCompletes: acc.videoCompletes + d.videoCompletes,
      }),
      { impressions: 0, clicks: 0, results: 0, videoCompletes: 0 },
    )
    const booked = bookedDeliverables(item)
    return { item, id, daily, totals, booked }
  })

  // Drop plan-only orphans with zero matched rows from the accordion; keep aggregate from matched.
  const withDelivery = metrics.filter((m) => m.daily.length > 0)
  if (!withDelivery.length) return null

  const rollup = withDelivery.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.totals.impressions,
      clicks: acc.clicks + m.totals.clicks,
      results: acc.results + m.totals.results,
      videoCompletes: acc.videoCompletes + m.totals.videoCompletes,
      plannedImpressions: acc.plannedImpressions + m.booked.impressions,
      plannedClicks: acc.plannedClicks + m.booked.clicks,
    }),
    {
      impressions: 0,
      clicks: 0,
      results: 0,
      videoCompletes: 0,
      plannedImpressions: 0,
      plannedClicks: 0,
    },
  )

  const ctr = safeDiv(rollup.clicks, rollup.impressions) * 100

  const ctrTargetRaw = (() => {
    const rows = withDelivery
      .map((m) => getLineItemKpiRow(input.lineItemTargets, input.mbaNumber, input.kpiVersionNumber, m.id))
      .filter(Boolean) as CampaignKPI[]
    if (!rows.length) return undefined
    const first = rows[0]?.ctr
    if (first == null || first <= 0) return undefined
    if (!rows.every((r) => r.ctr === first)) return undefined
    return ratioTargetPercentPoints(first)
  })()

  const aggregateKpiTiles: KpiTileProps[] = [
    {
      label: "Served impressions",
      value: formatWholeNumber(rollup.impressions),
      accentColour,
    },
    {
      label: "Clicks",
      value: formatWholeNumber(rollup.clicks),
      accentColour,
    },
    {
      label: "CTR",
      value: fmtPct(ctr),
      expected: ctrTargetRaw != null ? fmtPct(ctrTargetRaw) : undefined,
      status:
        ctrTargetRaw != null && ctrTargetRaw > 0
          ? pacingPctToStatus(safeDiv(ctr, ctrTargetRaw) * 100)
          : "no-data",
      accentColour,
    },
    {
      label: "Video completes",
      value: formatWholeNumber(rollup.videoCompletes),
      accentColour,
    },
    {
      label: "Results",
      value: formatWholeNumber(rollup.results),
      accentColour,
    },
  ]

  const aggDaily = aggregateDailyRows(
    withDelivery.flatMap((m) =>
      m.daily.map((d) => ({
        date: d.date,
        impressions: d.impressions,
        clicks: d.clicks,
      })),
    ),
    ["impressions", "clicks"],
  )

  const impressionsSpark = aggDaily.map((d) => Number(d.impressions ?? 0))
  const clicksSpark = aggDaily.map((d) => Number(d.clicks ?? 0))

  const impressionsCard = deliveryProgressCard({
    title: "Impressions delivery",
    actual: rollup.impressions,
    planned: rollup.plannedImpressions,
    sparkline: impressionsSpark,
  })
  const clicksCard = deliveryProgressCard({
    title: "Clicks delivery",
    actual: rollup.clicks,
    planned: rollup.plannedClicks,
    sparkline: clicksSpark,
  })

  const accordionItems = withDelivery.map((m) => {
    const liCtr = safeDiv(m.totals.clicks, m.totals.impressions) * 100
    const kpiRow = getLineItemKpiRow(input.lineItemTargets, input.mbaNumber, input.kpiVersionNumber, m.id)
    const liCtrTarget = ratioTargetPercentPoints(kpiRow?.ctr)

    const dailyRows = m.daily.map((d) => ({
      date: d.date,
      impressions: d.impressions,
    }))

    const block: LineItemBlockProps = {
      name: String(m.item.line_item_name ?? m.item.lineItemName ?? m.id),
      platform: String(m.item.buy_type ?? m.item.platform ?? "CM360"),
      progressCards: [
        deliveryProgressCard({
          title: "Impressions delivery",
          actual: m.totals.impressions,
          planned: m.booked.impressions,
          sparkline: m.daily.map((d) => d.impressions),
          dense: true,
        }),
        deliveryProgressCard({
          title: "Clicks delivery",
          actual: m.totals.clicks,
          planned: m.booked.clicks,
          sparkline: m.daily.map((d) => d.clicks),
          dense: true,
        }),
      ],
      kpiBand: {
        title: "Verification KPIs",
        tiles: [
          {
            label: "Served impressions",
            value: formatWholeNumber(m.totals.impressions),
            accentColour,
          },
          {
            label: "Clicks",
            value: formatWholeNumber(m.totals.clicks),
            accentColour,
          },
          {
            label: "CTR",
            value: fmtPct(liCtr),
            expected: liCtrTarget != null ? fmtPct(liCtrTarget) : undefined,
            status:
              liCtrTarget != null && liCtrTarget > 0
                ? pacingPctToStatus(safeDiv(liCtr, liCtrTarget) * 100)
                : "no-data",
            accentColour,
          },
          {
            label: "Video completes",
            value: formatWholeNumber(m.totals.videoCompletes),
            accentColour,
          },
          {
            label: "Results",
            value: formatWholeNumber(m.totals.results),
            accentColour,
          },
        ],
      },
      chart: {
        kind: "daily-delivery",
        daily: dailyRows,
        series: [{ key: "impressions", label: "Impressions", yAxis: "left" }],
        asAtDate: asAtISO,
        brandColour: input.brandColour,
      },
    }

    return { id: m.id, block }
  })

  return {
    key: "ad-serving",
    title: "Ad Serving",
    dateRange: { startISO: input.campaignStart, endISO: input.campaignEnd },
    lastSyncedAt: input.lastSyncedAt,
    connections: [
      {
        label: "Ad server verification (CM360) — delivery counts, no spend data",
        tone: "cm360",
      },
    ],
    mediaTypeColour: accentColour,
    aggregate: {
      summaryChips: [
        { label: "Served impressions", value: formatWholeNumber(rollup.impressions) },
        { label: "Clicks", value: formatWholeNumber(rollup.clicks) },
        { label: "CTR", value: fmtPct(ctr) },
        { label: "Video completes", value: formatWholeNumber(rollup.videoCompletes) },
      ],
      progressCards: [impressionsCard, clicksCard],
      kpiBand: {
        title: "Verification KPIs",
        subtitle: "CM360 delivery counts — spend not applicable",
        tiles: aggregateKpiTiles,
      },
      chart: {
        daily: aggDaily.map((d) => ({ date: d.date, impressions: Number(d.impressions ?? 0) })),
        series: [{ key: "impressions", label: "Impressions", yAxis: "left" }],
        asAtDate: asAtISO,
        brandColour: input.brandColour,
      },
    },
    lineItems: accordionItems,
  }
}

function ratioTargetPercentPoints(raw: number | null | undefined): number | undefined {
  if (raw == null || raw <= 0) return undefined
  return normaliseRatioTarget(raw) * 100
}
