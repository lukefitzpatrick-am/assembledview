/**
 * Per-channel KPI review for the campaign MBA page.
 *
 * Groups are the same channel-platform buckets `channelCoverage` produces.
 * Targets stay at line-item grain (`campaign_kpi`) and are never averaged
 * across channels. Delivered values come from the adapter/PACING_FACT
 * aggregate for that group only.
 */

import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"
import { deliverableLabelForBuyType } from "@/lib/delivery/deliverableLabel"
import type { DeliverySource } from "@/lib/delivery/deliverySourceMap"
import { formatMoney } from "@/lib/format/money"
import { CLIENT_KPI_METRIC_LABELS, type CampaignKPI } from "@/lib/kpi/types"
import { formatStoredDecimalAsPercent } from "@/lib/kpi/percentUnits"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
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

export type KpiReviewPlanLine = {
  buyType: string
  plannedSpend: number
  buyAmount: number | null
  plannedViews: number | null
  plannedImpressions: number | null
  /** Plan clicks when the line is a click buy or carries an explicit clicks goal. */
  plannedClicks?: number | null
}

export type KpiReviewCpvCaption =
  | "plan rate"
  | "plan rate, derived"
  | "plan rate, derived from VTR target"

export type KpiReviewCoverageDraft = {
  key: string
  label: string
  colour: string
  family: string
  deliverySource: DeliverySource | undefined
  lineItemIds: string[]
  plannedSpendByLineId: Record<string, number>
  planByLineId: Record<string, KpiReviewPlanLine>
}

export type KpiReviewGroup = {
  key: string
  label: string
  colour: string
  lineItemIds: string[]
  plannedSpendByLineId: Record<string, number>
  planByLineId: Record<string, KpiReviewPlanLine>
  impressions: number
  clicks: number
  results: number
  /** Views the source reports (VIDEO_3S_VIEWS / completes / ThruPlays). 0 = not tracked. */
  views: number | null
  /** COMPLETED_VIEWS when the source tracks them. */
  completes: number | null
  /** Spend the glance card shows (actual, reported fixed-cost, or modelled). */
  spend: number | null
  spendModelled: boolean
  vtrTracked: boolean
}

export type KpiReviewTargetSource = "target" | "benchmark"

export type KpiReviewRow = {
  metric: KpiReviewMetricKey
  label: string
  targetDisplay: string
  deliveredDisplay: string
  status: DeliveryStatus
  omitted: boolean
  modelled?: boolean
  targetSource: KpiReviewTargetSource | null
  benchmarkRef?: string | null
  /** CPV plan-rate caption (a/b/c). Other metrics keep plan target / benchmark. */
  targetCaption?: string | null
}

export type KpiReviewCard = {
  key: string
  label: string
  colour: string
  rows: KpiReviewRow[]
  noTargets: boolean
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

function asRecord(item: unknown): Record<string, unknown> {
  return item && typeof item === "object" ? (item as Record<string, unknown>) : {}
}

function parseMoneyish(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function isCpvBuyType(buyType: string | null | undefined): boolean {
  const t = String(buyType ?? "").trim().toLowerCase()
  if (!t) return false
  return t === "cpv" || t === "cpcv" || t.includes("cpv") || t.includes("cpcv")
}

export function isCpcBuyType(buyType: string | null | undefined): boolean {
  return deliverableLabelForBuyType(buyType) === "Clicks"
}

function isViewsDeliverable(buyType: string): boolean {
  if (isCpvBuyType(buyType)) return true
  return deliverableLabelForBuyType(buyType) === "Views"
}

export function extractKpiReviewPlanLine(item: unknown, plannedSpend: number): KpiReviewPlanLine {
  const rec = asRecord(item)
  const buyType = String(rec.buy_type ?? rec.buyType ?? "").trim()
  const bursts = parseBurstsToNormalised(rec.bursts ?? rec.bursts_json)
  let buyWeight = 0
  let buySum = 0
  let calculated = 0
  for (const burst of bursts) {
    const weight =
      burst.mediaAmount && burst.mediaAmount > 0 ? burst.mediaAmount : burst.budget
    if (burst.buyAmount > 0 && weight > 0) {
      buySum += burst.buyAmount * weight
      buyWeight += weight
    }
    if (burst.calculatedValue > 0) calculated += burst.calculatedValue
  }
  const explicitViews = parseMoneyish(
    rec.views ?? rec.plannedViews ?? rec.calculatedViews ?? rec.video_views ?? rec.videoViews,
  )
  const impressions = parseMoneyish(
    rec.impressions ?? rec.plannedImpressions ?? rec.units ?? rec.quantity,
  )
  const viewsBuy = isViewsDeliverable(buyType)
  const clicksBuy = isCpcBuyType(buyType)
  const explicitClicks = parseMoneyish(rec.clicks ?? rec.plannedClicks ?? rec.calculatedClicks)
  const plannedViews = explicitViews > 0 ? explicitViews : viewsBuy && calculated > 0 ? calculated : null
  const plannedClicks = explicitClicks > 0 ? explicitClicks : clicksBuy && calculated > 0 ? calculated : null
  const plannedImpressions =
    !viewsBuy && !clicksBuy && (impressions > 0 || calculated > 0)
      ? impressions > 0
        ? impressions
        : calculated
      : impressions > 0
        ? impressions
        : null
  return {
    buyType,
    plannedSpend,
    buyAmount: buyWeight > 0 ? buySum / buyWeight : null,
    plannedViews,
    plannedImpressions,
    plannedClicks,
  }
}

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
      planByLineId: { ...(draft.planByLineId ?? {}) },
      impressions,
      clicks,
      results,
      views: video3sViews,
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

function rowTargetSource(row: CampaignKPI | undefined): KpiReviewTargetSource {
  return row?.target_source === "benchmark" ? "benchmark" : "target"
}

export function resolveGroupTarget(
  group: KpiReviewGroup,
  metric: KpiReviewMetricKey,
  lineItemTargets: Map<string, CampaignKPI>,
): {
  value: number
  source: KpiReviewTargetSource
  benchmarkRef: string | null
} | null {
  const values: Array<{
    value: number
    spend: number
    source: KpiReviewTargetSource
    benchmarkRef: string | null
  }> = []
  for (const lineId of group.lineItemIds) {
    const row = kpiRowForLine(lineItemTargets, lineId)
    const value = metricValue(row, metric)
    if (!isSetTarget(value)) continue
    const ref = typeof row?.benchmark_ref === "string" ? row.benchmark_ref.trim() : ""
    values.push({
      value,
      spend: Number(group.plannedSpendByLineId[lineId] ?? 0) || 0,
      source: rowTargetSource(row),
      benchmarkRef: ref || null,
    })
  }
  if (values.length === 0) return null
  const first = values[0]!.value
  const value = values.every((item) => item.value === first)
    ? first
    : (() => {
        const spendTotal = values.reduce((sum, item) => sum + item.spend, 0)
        if (spendTotal > 0) {
          return values.reduce((sum, item) => sum + item.value * item.spend, 0) / spendTotal
        }
        return values.reduce((sum, item) => sum + item.value, 0) / values.length
      })()
  const hasPlan = values.some((item) => item.source === "target")
  const source: KpiReviewTargetSource = hasPlan ? "target" : "benchmark"
  const refs = [
    ...new Set(
      values
        .filter((item) => item.source === "benchmark" && item.benchmarkRef)
        .map((item) => item.benchmarkRef!),
    ),
  ]
  return {
    value,
    source,
    benchmarkRef: source === "benchmark" ? (refs[0] ?? null) : null,
  }
}

export function resolveCpvPlanRate(
  group: KpiReviewGroup,
  lineItemTargets: Map<string, CampaignKPI>,
): { value: number; caption: KpiReviewCpvCaption } | null {
  const parts: Array<{ spend: number; rate: number; caption: KpiReviewCpvCaption }> = []
  for (const lineId of group.lineItemIds) {
    const plan = group.planByLineId?.[lineId]
    const spend = Number(group.plannedSpendByLineId[lineId] ?? plan?.plannedSpend ?? 0) || 0
    const buy = plan?.buyType ?? ""
    if (isCpvBuyType(buy) && plan?.buyAmount && plan.buyAmount > 0) {
      parts.push({
        spend: spend > 0 ? spend : 1,
        rate: plan.buyAmount,
        caption: "plan rate",
      })
      continue
    }
    if (plan?.plannedViews && plan.plannedViews > 0 && spend > 0) {
      parts.push({
        spend,
        rate: spend / plan.plannedViews,
        caption: "plan rate, derived",
      })
      continue
    }
    const impressions = plan?.plannedImpressions ?? 0
    const vtr = metricValue(kpiRowForLine(lineItemTargets, lineId), "vtr")
    if (impressions > 0 && spend > 0 && isSetTarget(vtr)) {
      parts.push({
        spend,
        rate: spend / (impressions * vtr),
        caption: "plan rate, derived from VTR target",
      })
    }
  }
  if (parts.length === 0) return null
  const spendTotal = parts.reduce((sum, part) => sum + part.spend, 0)
  const value =
    spendTotal > 0
      ? parts.reduce((sum, part) => sum + part.rate * part.spend, 0) / spendTotal
      : parts[0]!.rate
  const captions = [...new Set(parts.map((part) => part.caption))]
  const caption =
    captions.length === 1
      ? captions[0]!
      : captions.includes("plan rate")
        ? "plan rate"
        : captions.includes("plan rate, derived")
          ? "plan rate, derived"
          : captions[0]!
  return { value, caption }
}

export type KpiReviewCostCaption = "plan rate" | "No click basis"

export function resolveCpmPlanRate(
  group: KpiReviewGroup,
): { value: number; caption: "plan rate" } | null {
  const parts: Array<{ spend: number; rate: number }> = []
  for (const lineId of group.lineItemIds) {
    const plan = group.planByLineId?.[lineId]
    const spend = Number(group.plannedSpendByLineId[lineId] ?? plan?.plannedSpend ?? 0) || 0
    const impressions = plan?.plannedImpressions ?? 0
    if (impressions > 0 && spend > 0) {
      parts.push({ spend, rate: (spend / impressions) * 1000 })
    }
  }
  if (parts.length === 0) return null
  const spendTotal = parts.reduce((sum, part) => sum + part.spend, 0)
  const value =
    spendTotal > 0
      ? parts.reduce((sum, part) => sum + part.rate * part.spend, 0) / spendTotal
      : parts[0]!.rate
  return { value, caption: "plan rate" }
}

export function resolveCpcPlanRate(
  group: KpiReviewGroup,
): { value: number; caption: "plan rate" } | { value: null; caption: "No click basis" } {
  const parts: Array<{ spend: number; rate: number }> = []
  for (const lineId of group.lineItemIds) {
    const plan = group.planByLineId?.[lineId]
    const spend = Number(group.plannedSpendByLineId[lineId] ?? plan?.plannedSpend ?? 0) || 0
    const buy = plan?.buyType ?? ""
    if (isCpcBuyType(buy) && plan?.buyAmount && plan.buyAmount > 0) {
      parts.push({ spend: spend > 0 ? spend : 1, rate: plan.buyAmount })
      continue
    }
    const clicks = plan?.plannedClicks ?? 0
    if (clicks > 0 && spend > 0) {
      parts.push({ spend, rate: spend / clicks })
    }
  }
  if (parts.length === 0) return { value: null, caption: "No click basis" }
  const spendTotal = parts.reduce((sum, part) => sum + part.spend, 0)
  const value =
    spendTotal > 0
      ? parts.reduce((sum, part) => sum + part.rate * part.spend, 0) / spendTotal
      : parts[0]!.rate
  return { value, caption: "plan rate" }
}

export function statusForCostMetric(target: number, delivered: number | null): DeliveryStatus {
  if (delivered == null || !Number.isFinite(delivered) || !(delivered > 0)) return "no-data"
  return deliveryStatusFromPct((target / delivered) * 100)
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
  // cpv — never invent $0 when spend is hidden (ZERO-$ LAW)
  if (group.spend == null) return { value: null, display: "—" }
  if (group.views == null || !(group.views > 0)) {
    return { value: null, display: "Not tracked for this source" }
  }
  const value = group.spend / group.views
  return {
    value: Number.isFinite(value) ? value : null,
    display: Number.isFinite(value) ? formatMoney(value) : "—",
    modelled: group.spendModelled,
  }
}

export function statusForMetric(
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

/** Campaign-read best/worst may only use a row the review card treats as tracked. */
export function kpiRowEligibleForReadBeat(
  row: Pick<KpiReviewRow, "deliveredDisplay">,
): boolean {
  const display = String(row.deliveredDisplay ?? "").trim()
  if (!display) return false
  if (display === "Not tracked for this source") return false
  if (display === "Not tracked yet") return false
  if (display === "—") return false
  return true
}

export function formatTarget(metric: KpiReviewMetricKey, target: number): string {
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
      const delivered = deliveredRatio(group, metric)
      if (metric === "cpv") {
        const planRate = resolveCpvPlanRate(group, input.lineItemTargets)
        if (planRate) {
          rows.push({
            metric,
            label: CLIENT_KPI_METRIC_LABELS[metric] ?? metric,
            targetDisplay: formatTarget(metric, planRate.value),
            deliveredDisplay: delivered.display,
            status: statusForMetric(metric, planRate.value, delivered.value),
            omitted: false,
            modelled: delivered.modelled,
            targetSource: "target",
            targetCaption: planRate.caption,
          })
          continue
        }
        rows.push({
          metric,
          label: CLIENT_KPI_METRIC_LABELS[metric] ?? metric,
          targetDisplay: "Not a view buy",
          deliveredDisplay: delivered.display,
          status: "no-data",
          omitted: false,
          modelled: delivered.modelled,
          targetSource: null,
          targetCaption: null,
        })
        continue
      }
      const target = resolveGroupTarget(group, metric, input.lineItemTargets)
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
          targetSource: null,
        })
        continue
      }
      rows.push({
        metric,
        label: CLIENT_KPI_METRIC_LABELS[metric] ?? metric,
        targetDisplay: formatTarget(metric, target.value),
        deliveredDisplay: delivered.display,
        status: statusForMetric(metric, target.value, delivered.value),
        omitted: false,
        modelled: delivered.modelled,
        targetSource: target.source,
        benchmarkRef: target.benchmarkRef,
      })
    }
    const noTargets = !rows.some((row) => rowCountsAsTarget(row))
    cards.push({
      key: group.key,
      label: group.label,
      colour: group.colour,
      rows: noTargets ? [] : rows,
      noTargets,
    })
  }
  return cards
}

function rowCountsAsTarget(row: KpiReviewRow): boolean {
  if (row.omitted) return false
  if (row.metric === "cpv") return Boolean(row.targetCaption)
  return row.targetSource === "target" || row.targetSource === "benchmark"
}

export function shouldShowKpiReview(
  cards: readonly KpiReviewCard[],
  isAdmin: boolean,
): boolean {
  if (cards.length === 0) return false
  if (isAdmin) return true
  return cards.some((card) => !card.noTargets)
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
        JSON.stringify(g.planByLineId ?? {}),
      ].join("\u001f"),
    )
    .join("\u001e")
}
