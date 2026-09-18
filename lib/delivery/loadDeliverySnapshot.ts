import {
  fetchAllPlanLineItemsForDelivery,
  MEDIA_CONTAINER_ENDPOINTS,
  type MediaContainerLineItem,
} from "@/lib/api/media-containers"
import { getDataBackendFor } from "@/lib/data/backend"
import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import {
  cleanPacingLineItemId,
  extractPacingLineItemIdFromItem,
} from "@/lib/pacing/delivery/lineItemIds"
import { getAsOfDate } from "@/lib/pacing/maths"
import { classifySocialPacingPlatform } from "@/lib/pacing/social/resolveLiveSocialLineItems"
import { getCampaignPacingData, type PacingRow } from "@/lib/snowflake/pacing-service"
import { getSearchPacingData } from "@/lib/snowflake/search-pacing-service"
import { queryDailyFacts } from "@/lib/pacing/direct/fetchDirectPacingRows"
import {
  indexReportedSpendByLineDate,
  reportedSpendDaysFromDailyFacts,
} from "@/lib/delivery/programmatic/applyReportedSpend"
import {
  hasDeliveryFactActivity,
  lineHasDeliverySource,
  resolveDeliveryState,
} from "@/lib/delivery/deliveryState"
import { expectedSpendToDateFromBursts } from "@/lib/spend/expectedSpendToDateFromBursts"

type MediaTypeKey = keyof typeof MEDIA_CONTAINER_ENDPOINTS

export type LoadDeliverySnapshotInput = {
  mbaNumber: string
  versionNumber?: number
  mediaTypeFilter?: MediaTypeKey[]
  /** When false, search pacing is omitted even if search line items exist. Default true. */
  mpSearchEnabled?: boolean
  startDate?: string
  endDate?: string
  /** When set, Snowflake exec labels are prefixed (campaign-page delivered-totals). */
  snowflakeLabel?: string
  /**
   * Pre-resolved plan lines (e.g. campaign page `campaignData.lineItems`).
   * When provided and non-empty, skips the plans-backend fetch.
   * Keys match `collectChannelPlans` (both spellings: bvod / digiBvod, progVideo, …).
   */
  lineItemsByChannel?: Record<string, unknown[]>
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
  hasSource: boolean
  bursts: unknown
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

function toPlanLineMeta(item: MediaContainerLineItem, group: string): PlanLineMeta | null {
  const id = extractPacingLineItemIdFromItem(item as Record<string, unknown>)
  if (!id) return null
  const plannedBudget = plannedBudgetFromItem(item)
  if (plannedBudget === 0) return null
  const rec = item as Record<string, unknown>
  return {
    id,
    name: asString(item.name) || asString(item.placementName) || id,
    plannedBudget,
    plannedUnits: plannedUnitsFromItem(item),
    startDate: dateFromItem(item, ["start_date", "startDate", "placement_date", "flight_start"]),
    endDate: dateFromItem(item, ["end_date", "endDate", "flight_end"]),
    hasSource: lineHasDeliverySource({
      group,
      publisher: rec.publisher,
      platform: rec.platform,
    }),
    bursts: rec.bursts_json ?? rec.bursts ?? null,
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
  factIds: ReadonlySet<string>,
  overlaySpendIds: ReadonlySet<string>,
  asOf: string,
): DeliveryLineSnapshot[] {
  const lines: DeliveryLineSnapshot[] = []
  for (const id of [...planById.keys()].sort()) {
    const plan = planById.get(id)
    if (plan?.plannedBudget === 0) continue
    const delivered = deliveredById.get(id) ?? emptyMetrics()
    const hasFactRows = factIds.has(id)
    const deliveryState = resolveDeliveryState({
      hasFactRows,
      hasSource: plan?.hasSource ?? false,
      hasFixedCostSpend: overlaySpendIds.has(id) && delivered.spendToDate > 0 && !hasFactRows,
    })
    const noDeliveryRows = deliveryState !== "reported"
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
      expectedSpendToDate: expectedSpendToDateFromBursts(
        plan?.bursts,
        plan?.plannedBudget ?? 0,
        asOf,
      ),
      noDeliveryRows,
      deliveryState,
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

function collectFixedCostLineIds(
  byChannel: Record<string, MediaContainerLineItem[]>,
): string[] {
  const ids = new Set<string>()
  for (const item of [
    ...(byChannel.progDisplay ?? []),
    ...(byChannel.progVideo ?? []),
    ...(byChannel.progOoh ?? []),
    ...(byChannel.progOOH ?? []),
    ...(byChannel.digitalDisplay ?? []),
    ...(byChannel.digiDisplay ?? []),
    ...(byChannel.digitalVideo ?? []),
    ...(byChannel.digiVideo ?? []),
    ...(byChannel.digitalAudio ?? []),
    ...(byChannel.digiAudio ?? []),
    ...(byChannel.bvod ?? []),
    ...(byChannel.digiBvod ?? []),
    ...(byChannel.digi_bvod ?? []),
  ]) {
    if (item.fixedCostMedia !== true && item.fixed_cost_media !== true) continue
    const id = extractPacingLineItemIdFromItem(item as Record<string, unknown>)
    if (id) ids.add(id)
  }
  return [...ids]
}

function overlayReportedSpendOnSnapshot(
  deliveredById: Map<string, ReturnType<typeof emptyMetrics>>,
  byLine: Map<string, Map<string, number>>,
  lineIds: string[],
  startDate?: string,
  endDate?: string,
): Set<string> {
  const overlaySpendIds = new Set<string>()
  for (const id of lineIds) {
    const byDate = byLine.get(id) ?? byLine.get(String(id).toLowerCase())
    if (!byDate || byDate.size === 0) continue
    let spend = 0
    let inWindow = false
    for (const [date, amount] of byDate) {
      if (startDate && date < startDate) continue
      if (endDate && date > endDate) continue
      spend += amount
      inWindow = true
    }
    if (!inWindow) continue
    const cur = deliveredById.get(id) ?? emptyMetrics()
    cur.spendToDate = spend
    deliveredById.set(id, cur)
    if (spend > 0) overlaySpendIds.add(id)
  }
  return overlaySpendIds
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
    const platform = classifySocialPacingPlatform(item as Record<string, unknown>)
    const group =
      platform === "meta"
        ? "social_meta"
        : platform === "tiktok"
          ? "social_tiktok"
          : platform === "reddit"
            ? "social_reddit"
            : "plan_only"
    const meta = toPlanLineMeta(item, group)
    if (!meta) continue
    allMetas.push(meta)
    ensure(group).set(meta.id, meta)
  }

  for (const item of byChannel.progDisplay ?? []) {
    const meta = toPlanLineMeta(item, "programmatic_display")
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_display").set(meta.id, meta)
  }

  for (const item of byChannel.progVideo ?? []) {
    const meta = toPlanLineMeta(item, "programmatic_video")
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_video").set(meta.id, meta)
  }

  for (const item of [...(byChannel.progOoh ?? []), ...(byChannel.progOOH ?? [])]) {
    const meta = toPlanLineMeta(item, "programmatic_ooh")
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_ooh").set(meta.id, meta)
  }

  const ingestDirectDigital = (keys: readonly string[], group: string) => {
    for (const key of keys) {
      for (const item of byChannel[key] ?? []) {
        const meta = toPlanLineMeta(item, group)
        if (!meta) continue
        allMetas.push(meta)
        ensure(group).set(meta.id, meta)
      }
    }
  }
  ingestDirectDigital(["digitalDisplay", "digiDisplay"], "digital_display")
  ingestDirectDigital(["digitalVideo", "digiVideo"], "digital_video")
  ingestDirectDigital(["digitalAudio", "digiAudio"], "digital_audio")
  ingestDirectDigital(["bvod", "digiBvod", "digi_bvod"], "bvod")

  for (const item of byChannel.search ?? []) {
    const meta = toPlanLineMeta(item, "search")
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

function hasProvidedLineItems(
  map: Record<string, unknown[]> | undefined,
): map is Record<string, unknown[]> {
  if (!map) return false
  return Object.values(map).some((arr) => Array.isArray(arr) && arr.length > 0)
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
  const byChannel = hasProvidedLineItems(input.lineItemsByChannel)
    ? (input.lineItemsByChannel as Record<string, MediaContainerLineItem[]>)
    : await fetchAllPlanLineItemsForDelivery(mba, versionNumber, input.mediaTypeFilter)
  const { groups, allMetas, searchIds, nonSearchIds } = collectChannelPlans(byChannel)
  const fixedCostLineIds = collectFixedCostLineIds(byChannel)
  if (allMetas.length === 0) {
    console.warn("[loadDeliverySnapshot] no plan lines resolved", {
      mba,
      versionNumber,
      backend: getDataBackendFor("plans"),
    })
  }

  const flight = flightWindowFromPlan(allMetas)
  const startDate = input.startDate ?? flight.startDate
  const endDate = input.endDate ?? flight.endDate

  const mpSearchEnabled = input.mpSearchEnabled !== false
  const includeSearch = Boolean(mpSearchEnabled && searchIds.length > 0)
  const snowflakeLabel = input.snowflakeLabel

  let pacingRows: PacingRow[] = []
  const searchDelivered = new Map<string, ReturnType<typeof emptyMetrics>>()

  const pacingPromise =
    nonSearchIds.length > 0
      ? getCampaignPacingData(
          mba,
          nonSearchIds,
          { startDate, endDate },
          snowflakeLabel ? { label: snowflakeLabel } : undefined,
        )
      : Promise.resolve([] as PacingRow[])

  const searchPromise = includeSearch
    ? getSearchPacingData({
        lineItemIds: searchIds,
        startDate,
        endDate,
      })
    : Promise.resolve(null)

  const overlayPromise =
    fixedCostLineIds.length > 0
      ? queryDailyFacts(
          fixedCostLineIds,
          snowflakeLabel ? { label: snowflakeLabel } : undefined,
        ).catch((err) => {
          console.error("[loadDeliverySnapshot] reported daily facts failed", {
            mba,
            error: err instanceof Error ? err.message : String(err),
            cause: err,
          })
          return [] as Awaited<ReturnType<typeof queryDailyFacts>>
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof queryDailyFacts>>)

  const [rows, search, facts] = await Promise.all([pacingPromise, searchPromise, overlayPromise])
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

  let overlaySpendIds = new Set<string>()
  if (fixedCostLineIds.length > 0 && facts.length > 0) {
    overlaySpendIds = overlayReportedSpendOnSnapshot(
      deliveredById,
      indexReportedSpendByLineDate(reportedSpendDaysFromDailyFacts(facts)),
      fixedCostLineIds,
      startDate,
      endDate,
    )
  }

  const factIds = new Set(
    [...deliveredById.entries()]
      .filter(([, metrics]) => hasDeliveryFactActivity(metrics))
      .map(([id]) => id),
  )

  const channelOrder = [
    "social_meta",
    "social_tiktok",
    "social_reddit",
    "programmatic_display",
    "programmatic_video",
    "programmatic_ooh",
    "digital_display",
    "digital_video",
    "digital_audio",
    "bvod",
    "search",
    "plan_only",
  ]

  const asOf = getAsOfDate()
  const channels: DeliveryChannelGroup[] = []
  for (const group of channelOrder) {
    const planMap = groups.get(group)
    if (!planMap || planMap.size === 0) continue
    if (group === "search" && !includeSearch) continue
    const lines = buildLines(planMap, deliveredById, factIds, overlaySpendIds, asOf)
    channels.push({
      group,
      lines,
      totals: sumLines(lines),
    })
  }

  const planTotals = sumLines(channels.flatMap((c) => c.lines))

  return {
    asOf,
    window: { startDate: startDate ?? null, endDate: endDate ?? null },
    mbaNumber: mba,
    versionNumber: versionNumber ?? null,
    channels,
    planTotals,
  }
}
