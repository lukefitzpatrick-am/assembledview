import {
  fetchAllMediaContainerLineItems,
  MEDIA_CONTAINER_ENDPOINTS,
  type MediaContainerLineItem,
} from "@/lib/api/media-containers"
import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import {
  cleanPacingLineItemId,
  extractPacingLineItemIdFromItem,
} from "@/lib/pacing/delivery/lineItemIds"
import { getAsOfDate } from "@/lib/pacing/maths"
import { classifySocialPacingPlatform } from "@/lib/pacing/social/resolveLiveSocialLineItems"
import { getCampaignPacingData, type PacingRow } from "@/lib/snowflake/pacing-service"
import { getSearchPacingData } from "@/lib/snowflake/search-pacing-service"

type MediaTypeKey = keyof typeof MEDIA_CONTAINER_ENDPOINTS

export type LoadDeliverySnapshotInput = {
  mbaNumber: string
  versionNumber?: number
  mediaTypeFilter?: MediaTypeKey[]
  /** When false, search pacing is omitted even if search line items exist. Default true. */
  mpSearchEnabled?: boolean
  startDate?: string
  endDate?: string
}

export type LoadedDeliverySnapshot = {
  asOf: string
  window: { startDate: string | null; endDate: string | null }
  mbaNumber: string
  versionNumber: number | null
  channels: DeliveryChannelGroup[]
  planTotals: DeliveryChannelGroup["totals"]
}

type PlanLineMeta = {
  id: string
  name: string
  plannedBudget: number | null
  plannedUnits: number | null
  startDate: string | null
  endDate: string | null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function plannedBudgetFromItem(item: MediaContainerLineItem): number | null {
  return (
    asNumber(item.totalMedia) ??
    asNumber(item.grossMedia) ??
    asNumber(item.budget) ??
    asNumber(item.spend) ??
    asNumber(item.investment) ??
    null
  )
}

function plannedUnitsFromItem(item: MediaContainerLineItem): number | null {
  return (
    asNumber(item.impressions) ??
    asNumber(item.units) ??
    asNumber(item.quantity) ??
    asNumber(item.plannedImpressions) ??
    null
  )
}

function dateFromItem(item: MediaContainerLineItem, keys: string[]): string | null {
  const record = item as Record<string, unknown>
  for (const key of keys) {
    const raw = asString(record[key])
    if (raw) return raw.slice(0, 10)
  }
  return null
}

function toPlanLineMeta(item: MediaContainerLineItem): PlanLineMeta | null {
  const id = extractPacingLineItemIdFromItem(item as Record<string, unknown>)
  if (!id) return null
  return {
    id,
    name: asString(item.name) || asString(item.placementName) || id,
    plannedBudget: plannedBudgetFromItem(item),
    plannedUnits: plannedUnitsFromItem(item),
    startDate: dateFromItem(item, ["start_date", "startDate", "placement_date", "flight_start"]),
    endDate: dateFromItem(item, ["end_date", "endDate", "flight_end"]),
  }
}

function emptyMetrics() {
  return {
    spendToDate: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
  }
}

function deriveRates(m: { spendToDate: number; impressions: number; clicks: number }) {
  const cpm = m.impressions > 0 ? (m.spendToDate / m.impressions) * 1000 : null
  const ctr = m.impressions > 0 ? m.clicks / m.impressions : null
  const cpc = m.clicks > 0 ? m.spendToDate / m.clicks : null
  return { cpm, ctr, cpc }
}

function aggregatePacingRows(rows: PacingRow[]): Map<string, ReturnType<typeof emptyMetrics>> {
  const byId = new Map<string, ReturnType<typeof emptyMetrics>>()
  for (const row of rows) {
    const id = cleanPacingLineItemId(row.lineItemId)
    if (!id) continue
    const cur = byId.get(id) ?? emptyMetrics()
    cur.spendToDate += row.amountSpent || 0
    cur.impressions += row.impressions || 0
    cur.clicks += row.clicks || 0
    cur.results += row.results || 0
    cur.video3sViews += row.video3sViews || 0
    byId.set(id, cur)
  }
  return byId
}

function buildLines(
  planById: Map<string, PlanLineMeta>,
  deliveredById: Map<string, ReturnType<typeof emptyMetrics>>,
): DeliveryLineSnapshot[] {
  const lines: DeliveryLineSnapshot[] = []
  for (const id of [...planById.keys()].sort()) {
    const plan = planById.get(id)
    const delivered = deliveredById.get(id) ?? emptyMetrics()
    const noDeliveryRows = !deliveredById.has(id)
    const rates = deriveRates(delivered)
    lines.push({
      lineItemId: id,
      name: plan?.name || id,
      plannedBudget: plan?.plannedBudget ?? null,
      plannedUnits: plan?.plannedUnits ?? null,
      startDate: plan?.startDate ?? null,
      endDate: plan?.endDate ?? null,
      spendToDate: delivered.spendToDate,
      impressions: delivered.impressions,
      clicks: delivered.clicks,
      results: delivered.results,
      video3sViews: delivered.video3sViews,
      cpm: rates.cpm,
      ctr: rates.ctr,
      cpc: rates.cpc,
      noDeliveryRows,
    })
  }
  return lines
}

function sumLines(lines: DeliveryLineSnapshot[]) {
  const totals = emptyMetrics()
  let plannedBudget = 0
  let hasBudget = false
  for (const line of lines) {
    totals.spendToDate += line.spendToDate
    totals.impressions += line.impressions
    totals.clicks += line.clicks
    totals.results += line.results
    totals.video3sViews += line.video3sViews
    if (typeof line.plannedBudget === "number") {
      plannedBudget += line.plannedBudget
      hasBudget = true
    }
  }
  const rates = deriveRates(totals)
  return {
    ...totals,
    plannedBudget: hasBudget ? plannedBudget : null,
    cpm: rates.cpm,
    ctr: rates.ctr,
    cpc: rates.cpc,
  }
}

function flightWindowFromPlan(metas: PlanLineMeta[]): { startDate?: string; endDate?: string } {
  let start: string | undefined
  let end: string | undefined
  for (const m of metas) {
    if (m.startDate && (!start || m.startDate < start)) start = m.startDate
    if (m.endDate && (!end || m.endDate > end)) end = m.endDate
  }
  return { startDate: start, endDate: end }
}

function collectChannelPlans(
  byChannel: Record<string, MediaContainerLineItem[]>,
): {
  groups: Map<string, Map<string, PlanLineMeta>>
  allMetas: PlanLineMeta[]
  searchIds: string[]
  nonSearchIds: string[]
} {
  const groups = new Map<string, Map<string, PlanLineMeta>>()
  const ensure = (group: string) => {
    if (!groups.has(group)) groups.set(group, new Map())
    return groups.get(group)!
  }
  const allMetas: PlanLineMeta[] = []

  const social = byChannel.socialMedia ?? []
  for (const item of social) {
    const meta = toPlanLineMeta(item)
    if (!meta) continue
    allMetas.push(meta)
    const platform = classifySocialPacingPlatform(item as Record<string, unknown>)
    if (platform === "meta") ensure("social_meta").set(meta.id, meta)
    else if (platform === "tiktok") ensure("social_tiktok").set(meta.id, meta)
  }

  for (const item of byChannel.progDisplay ?? []) {
    const meta = toPlanLineMeta(item)
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_display").set(meta.id, meta)
  }

  for (const item of byChannel.progVideo ?? []) {
    const meta = toPlanLineMeta(item)
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_video").set(meta.id, meta)
  }

  const adServingKeys = ["digitalDisplay", "digitalVideo", "digitalAudio", "bvod"] as const
  for (const key of adServingKeys) {
    for (const item of byChannel[key] ?? []) {
      const meta = toPlanLineMeta(item)
      if (!meta) continue
      allMetas.push(meta)
      ensure("ad_serving").set(meta.id, meta)
    }
  }

  for (const item of byChannel.search ?? []) {
    const meta = toPlanLineMeta(item)
    if (!meta) continue
    allMetas.push(meta)
    ensure("search").set(meta.id, meta)
  }

  const searchIds = [...(groups.get("search")?.keys() ?? [])].sort()
  const nonSearchIds = new Set<string>()
  for (const [group, map] of groups) {
    if (group === "search") continue
    for (const id of map.keys()) nonSearchIds.add(id)
  }

  return {
    groups,
    allMetas,
    searchIds,
    nonSearchIds: [...nonSearchIds].sort(),
  }
}

/**
 * Same Snowflake + media-container delivery totals used by get_delivery_snapshot
 * and the performance deck. Throws on Snowflake failure so callers can decide UX.
 */
export async function loadDeliverySnapshot(
  input: LoadDeliverySnapshotInput,
): Promise<LoadedDeliverySnapshot> {
  const mba = input.mbaNumber.trim()
  if (!mba) {
    throw new Error("mbaNumber is required")
  }

  const versionNumber = input.versionNumber
  const byChannel = await fetchAllMediaContainerLineItems(mba, versionNumber, input.mediaTypeFilter)
  const { groups, allMetas, searchIds, nonSearchIds } = collectChannelPlans(byChannel)

  const flight = flightWindowFromPlan(allMetas)
  const startDate = input.startDate ?? flight.startDate
  const endDate = input.endDate ?? flight.endDate

  const mpSearchEnabled = input.mpSearchEnabled !== false
  const includeSearch = Boolean(mpSearchEnabled && searchIds.length > 0)

  let pacingRows: PacingRow[] = []
  const searchDelivered = new Map<string, ReturnType<typeof emptyMetrics>>()

  const pacingPromise =
    nonSearchIds.length > 0
      ? getCampaignPacingData(mba, nonSearchIds, { startDate, endDate })
      : Promise.resolve([] as PacingRow[])

  const searchPromise = includeSearch
    ? getSearchPacingData({
        lineItemIds: searchIds,
        startDate,
        endDate,
      })
    : Promise.resolve(null)

  const [rows, search] = await Promise.all([pacingPromise, searchPromise])
  pacingRows = rows
  if (search) {
    for (const series of search.lineItems ?? []) {
      const id = cleanPacingLineItemId(series.lineItemId)
      if (!id) continue
      searchDelivered.set(id, {
        spendToDate: series.totals.cost || 0,
        impressions: series.totals.impressions || 0,
        clicks: series.totals.clicks || 0,
        results: series.totals.conversions || 0,
        video3sViews: 0,
      })
    }
  }

  const deliveredById = aggregatePacingRows(pacingRows)
  for (const [id, metrics] of searchDelivered) {
    deliveredById.set(id, metrics)
  }

  const channelOrder = [
    "social_meta",
    "social_tiktok",
    "programmatic_display",
    "programmatic_video",
    "ad_serving",
    "search",
  ]

  const channels: DeliveryChannelGroup[] = []
  for (const group of channelOrder) {
    const planMap = groups.get(group)
    if (!planMap || planMap.size === 0) continue
    if (group === "search" && !includeSearch) continue
    const lines = buildLines(planMap, deliveredById)
    channels.push({
      group,
      lines,
      totals: sumLines(lines),
    })
  }

  const planTotals = sumLines(channels.flatMap((c) => c.lines))

  return {
    asOf: getAsOfDate(),
    window: { startDate: startDate ?? null, endDate: endDate ?? null },
    mbaNumber: mba,
    versionNumber: versionNumber ?? null,
    channels,
    planTotals,
  }
}
