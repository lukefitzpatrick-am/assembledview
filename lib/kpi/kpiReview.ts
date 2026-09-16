/**
 * Per-channel KPI review for the campaign MBA page.
 *
 * Groups are the same channel-platform buckets `channelCoverage` produces.
 * Targets stay at line-item grain (`campaign_kpi`) and are never averaged
 * across channels. Delivered values come from the adapter/PACING_FACT
 * aggregate for that group only.
 */

import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"
import type { DeliverySource } from "@/lib/delivery/deliverySourceMap"
import { formatMoney } from "@/lib/format/money"
import { CLIENT_KPI_METRIC_LABELS, type CampaignKPI } from "@/lib/kpi/types"
import { formatStoredDecimalAsPercent } from "@/lib/kpi/percentUnits"
import { cleanPacingLineItemId } from "@/lib/pacing/delivery/lineItemIds"
import {
  deliveryStatusFromPct,
  type DeliveryStatus,
} from "@/lib/pacing/deliveryStatusFromPct"

export const KPI_REVIEW_METRICS = [
  "ctr",
  "conversion_rate",
  "cpv",
  "vtr",
  "frequency",
] as const

export type KpiReviewMetricKey = (typeof KPI_REVIEW_METRICS)[number]

export type LineDeliveryActuals = {
  impressions: number
  clicks: number
  results: number
  video3sViews: number
}

export type KpiReviewCoverageDraft = {
  key: string
  label: string
  colour: string
  family: string
  deliverySource: DeliverySource | undefined
  lineItemIds: string[]
  plannedSpendByLineId: Record<string, number>
}

export type KpiReviewGroup = {
  key: string
  label: string
  colour: string
  lineItemIds: string[]
  plannedSpendByLineId: Record<string, number>
  impressions: number
  clicks: number
  results: number
  /** CPV denominator: VIDEO_3S_VIEWS (social), views (Channel Factory), completes (BVOD). */
  views: number | null
  /** COMPLETED_VIEWS when the source tracks them. */
  completes: number | null
  /** Spend the glance card shows (actual, reported fixed-cost, or modelled). */
  spend: number | null
  spendModelled: boolean
  vtrTracked: boolean
}

export type KpiReviewRow = {
  metric: KpiReviewMetricKey
  label: string
  targetDisplay: string
  deliveredDisplay: string
  status: DeliveryStatus
  omitted: boolean
  modelled?: boolean
}

export type KpiReviewCard = {
  key: string
  label: string
  colour: string
  rows: KpiReviewRow[]
}

type PacingActualRow = {
  lineItemId?: string | null
  impressions?: number | null
  clicks?: number | null
  results?: number | null
  video3sViews?: number | null
}

type SearchActualRow = {
  lineItemId?: string | null
  totals?: {
    impressions?: number | null
    clicks?: number | null
    conversions?: number | null
  } | null
}

const HIGHER_IS_BETTER = new Set<KpiReviewMetricKey>(["ctr", "conversion_rate", "vtr"])

export function indexLineDeliveryActuals(input: {
  pacingRows: readonly PacingActualRow[]
  searchLineItems: readonly SearchActualRow[]
}): Map<string, LineDeliveryActuals> {
  const map = new Map<string, LineDeliveryActuals>()

  const add = (id: string | null, delta: Partial<LineDeliveryActuals>) => {
    if (!id) return
    const current = map.get(id) ?? { impressions: 0, clicks: 0, results: 0, video3sViews: 0 }
    current.impressions += Number(delta.impressions ?? 0) || 0
    current.clicks += Number(delta.clicks ?? 0) || 0
    current.results += Number(delta.results ?? 0) || 0
    current.video3sViews += Number(delta.video3sViews ?? 0) || 0
    map.set(id, current)
  }

  for (const row of input.pacingRows) {
    add(cleanPacingLineItemId(row.lineItemId), {
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      results: row.results ?? 0,
      video3sViews: row.video3sViews ?? 0,
    })
  }
  for (const row of input.searchLineItems) {
    add(cleanPacingLineItemId(row.lineItemId), {
      impressions: row.totals?.impressions ?? 0,
      clicks: row.totals?.clicks ?? 0,
      results: row.totals?.conversions ?? 0,
      video3sViews: 0,
    })
  }
  return map
}

function vtrTrackedForDraft(draft: KpiReviewCoverageDraft): boolean {
  return draft.family === "programmatic-video" && draft.deliverySource === "partner_file"
}

function viewsKind(family: string): "video" | null {
  if (family.startsWith("social-")) return "video"
  if (family === "programmatic-video") return "video"
  if (family === "bvod") return "video"
  return null
}

export function buildKpiReviewGroups(input: {
  drafts: readonly KpiReviewCoverageDraft[]
  coverage: readonly ChannelCoverageEntry[]
  actualsByLineId: Map<string, LineDeliveryActuals>
}): KpiReviewGroup[] {
  const coverageByKey = new Map(input.coverage.map((entry) => [entry.key, entry]))
  const groups: KpiReviewGroup[] = []

  for (const draft of input.drafts) {
    if (draft.family === "no-source") continue
    const coverage = coverageByKey.get(draft.key)
    let impressions = 0
    let clicks = 0
    let results = 0
    let video3sViews = 0
    for (const lineId of draft.lineItemIds) {
      const actuals = input.actualsByLineId.get(lineId)
      if (!actuals) continue
      impressions += actuals.impressions
      clicks += actuals.clicks
      results += actuals.results
      video3sViews += actuals.video3sViews
    }
    const tracked = vtrTrackedForDraft(draft)
    groups.push({
      key: draft.key,
      label: draft.label,
      colour: draft.colour,
      lineItemIds: [...draft.lineItemIds],
      plannedSpendByLineId: { ...draft.plannedSpendByLineId },
      impressions,
      clicks,
      results,
      views: viewsKind(draft.family) ? video3sViews : null,
      completes: tracked ? video3sViews : null,
      spend: coverage?.deliveredSpend ?? null,
      spendModelled: coverage?.spendModelled === true,
      vtrTracked: tracked,
    })
  }
  return groups
}

function kpiRowForLine(map: Map<string, CampaignKPI>, lineId: string): CampaignKPI | undefined {
  const id = lineId.toLowerCase().trim()
  for (const row of map.values()) {
    if (row.line_item_id?.toLowerCase().trim() === id) return row
  }
  return undefined
}

function metricValue(row: CampaignKPI | undefined, metric: KpiReviewMetricKey): number | null {
  if (!row) return null
  const raw: unknown = row[metric]
  if (raw == null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 0 and null are "No target set" for this review. */
function isSetTarget(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0
}

function resolveGroupTarget(
  group: KpiReviewGroup,
  metric: KpiReviewMetricKey,
  lineItemTargets: Map<string, CampaignKPI>,
): number | null {
  const values: Array<{ value: number; spend: number }> = []
  for (const lineId of group.lineItemIds) {
    const value = metricValue(kpiRowForLine(lineItemTargets, lineId), metric)
    if (!isSetTarget(value)) continue
    values.push({
      value,
      spend: Number(group.plannedSpendByLineId[lineId] ?? 0) || 0,
    })
  }
  if (values.length === 0) return null
  const first = values[0]!.value
  if (values.every((item) => item.value === first)) return first
  const spendTotal = values.reduce((sum, item) => sum + item.spend, 0)
  if (spendTotal > 0) {
    return values.reduce((sum, item) => sum + item.value * item.spend, 0) / spendTotal
  }
  return values.reduce((sum, item) => sum + item.value, 0) / values.length
}

function ratio(numerator: number, denominator: number): number | null {
  if (!(denominator > 0)) return null
  const n = numerator / denominator
  return Number.isFinite(n) ? n : null
}

function deliveredRatio(
  group: KpiReviewGroup,
  metric: KpiReviewMetricKey,
): { value: number | null; display: string; modelled?: boolean } {
  if (metric === "frequency") {
    return { value: null, display: "Not tracked yet" }
  }
  if (metric === "vtr" && !group.vtrTracked) {
    return { value: null, display: "Not tracked for this source" }
  }
  if (metric === "ctr") {
    const value = ratio(group.clicks, group.impressions)
    return { value, display: value == null ? "—" : formatStoredDecimalAsPercent(value) }
  }
  if (metric === "conversion_rate") {
    const value = ratio(group.results, group.clicks)
    return { value, display: value == null ? "—" : formatStoredDecimalAsPercent(value) }
  }
  if (metric === "vtr") {
    const value = ratio(group.completes ?? 0, group.impressions)
    return { value, display: value == null ? "—" : formatStoredDecimalAsPercent(value) }
  }
  // cpv
  if (group.spend == null) return { value: null, display: "—" }
  if (group.views == null || !(group.views > 0)) return { value: null, display: "—" }
  const value = group.spend / group.views
  return {
    value: Number.isFinite(value) ? value : null,
    display: Number.isFinite(value) ? formatMoney(value) : "—",
    modelled: group.spendModelled,
  }
}

function statusForMetric(
  metric: KpiReviewMetricKey,
  target: number,
  delivered: number | null,
): DeliveryStatus {
  if (metric === "frequency") return "no-data"
  if (delivered == null || !Number.isFinite(delivered)) return "no-data"
  if (metric === "cpv") {
    if (!(delivered > 0)) return "no-data"
    return deliveryStatusFromPct((target / delivered) * 100)
  }
  if (HIGHER_IS_BETTER.has(metric)) {
    return deliveryStatusFromPct((delivered / target) * 100)
  }
  return "no-data"
}

function formatTarget(metric: KpiReviewMetricKey, target: number): string {
  if (metric === "cpv") return formatMoney(target)
  if (metric === "frequency") return target.toFixed(2)
  return formatStoredDecimalAsPercent(target)
}

export function buildKpiReview(input: {
  groups: readonly KpiReviewGroup[]
  lineItemTargets: Map<string, CampaignKPI>
  isAdmin: boolean
}): KpiReviewCard[] {
  const cards: KpiReviewCard[] = []
  for (const group of input.groups) {
    const rows: KpiReviewRow[] = []
    for (const metric of KPI_REVIEW_METRICS) {
      const target = resolveGroupTarget(group, metric, input.lineItemTargets)
      const delivered = deliveredRatio(group, metric)
      if (target == null) {
        if (!input.isAdmin) continue
        rows.push({
          metric,
          label: CLIENT_KPI_METRIC_LABELS[metric] ?? metric,
          targetDisplay: "No target set",
          deliveredDisplay: delivered.display,
          status: "no-data",
          omitted: true,
          modelled: delivered.modelled,
        })
        continue
      }
      rows.push({
        metric,
        label: CLIENT_KPI_METRIC_LABELS[metric] ?? metric,
        targetDisplay: formatTarget(metric, target),
        deliveredDisplay: delivered.display,
        status: statusForMetric(metric, target, delivered.value),
        omitted: false,
        modelled: delivered.modelled,
      })
    }
    if (rows.length === 0) continue
    cards.push({
      key: group.key,
      label: group.label,
      colour: group.colour,
      rows,
    })
  }
  return cards
}

export function kpiReviewGroupsIdentity(groups: readonly KpiReviewGroup[]): string {
  return groups
    .map((g) =>
      [
        g.key,
        g.impressions,
        g.clicks,
        g.results,
        g.views,
        g.completes,
        g.spend,
        g.spendModelled,
        g.vtrTracked,
        g.lineItemIds.join(","),
      ].join("\u001f"),
    )
    .join("\u001e")
}
