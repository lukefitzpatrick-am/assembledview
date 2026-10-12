import { cpc, cpm, ctr } from "@/lib/money/rates"
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
import { estimateDirectDigitalSpend } from "@/lib/delivery/estimateDirectDigitalSpend"
import {
  channelKeyForEstimateGroup,
  feePctForScheduleMedia,
  feePctFromVersionMap,
  positiveVersionId,
  versionIdFromLine,
  type DirectDigitalFeeChannelKey,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import { expectedSpendToDateFromBursts } from "@/lib/spend/expectedSpendToDateFromBursts"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import { netBurstExpectedInWindow } from "@/lib/reports/campaignReport/reportPace"
import { planDeliverablesFromItem } from "@/lib/reports/campaignReport/reportFigures"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { fromCents, toCents } from "@/lib/money/cents"
import { parseMoney } from "@/lib/money/parse"
import { assumedSpendForBurst } from "@/lib/spend/assumedSpend"
import { assumeSpendForSnapshotLine } from "@/lib/spend/assumeSpendRule"
import {
  assumedExpectedLineFromFields,
  channelMetaForKey,
} from "@/lib/spend/assumedExpectedLines"
import type { AssumedExpectedLine } from "@/lib/spend/assumedSpend"

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
  /**
   * Channel fee percents already loaded for this request. When set, the
   * snapshot does not read `mba_fee_snapshots` again.
   */
  feePctsByVersionId?: FeePctsByVersionId
  /** Version on screen when a line omits `media_plan_version`. */
  estimateVersionId?: number | null
}

export type LoadedDeliverySnapshot = {
  asOf: string
  window: { startDate: string | null; endDate: string | null }
  mbaNumber: string
  versionNumber: number | null
  channels: DeliveryChannelGroup[]
  planTotals: DeliveryChannelGroup["totals"]
  /** True when the fixed-cost reported-spend overlay query failed. Other snapshot totals still return. */
  fixedCostOverlayFailed?: boolean
  /** True when plan totals include CM360 direct-digital estimated spend. */
  includesEstimatedSpend?: boolean
  /** Assumed-spend lines, including bursts that have not started. */
  assumedExpectedLines?: AssumedExpectedLine[]
}

type PlanLineMeta = {
  id: string
  name: string
  plannedBudget: number | null
  plannedUnits: number | null
  plannedImpressions: number | null
  plannedClicks: number | null
  plannedViews: number | null
  startDate: string | null
  endDate: string | null
  hasSource: boolean
  bursts: unknown
  buyType: string | null
  budgetIncludesFees: boolean
  versionId: number | null
  feeChannel: DirectDigitalFeeChannelKey | null
  sourceTable: string
  mediaTypeLabel: string
  noAdserving: boolean
  publisher: string | null
  platform: string | null
  clientPaysForMedia: boolean
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

function toPlanLineMeta(
  item: MediaContainerLineItem,
  group: string,
  fallbackVersionId: number | null,
  origin?: { sourceTable: string; mediaTypeLabel: string },
): PlanLineMeta | null {
  const id = extractPacingLineItemIdFromItem(item as Record<string, unknown>)
  if (!id) return null
  const plannedBudget = plannedBudgetFromItem(item)
  if (plannedBudget === 0) return null
  const rec = item as Record<string, unknown>
  const deliverables = planDeliverablesFromItem(rec)
  return {
    id,
    name: asString(item.name) || asString(item.placementName) || id,
    plannedBudget,
    plannedUnits: plannedUnitsFromItem(item),
    plannedImpressions: deliverables.impressions,
    plannedClicks: deliverables.clicks,
    plannedViews: deliverables.views,
    startDate: dateFromItem(item, ["start_date", "startDate", "placement_date", "flight_start"]),
    endDate: dateFromItem(item, ["end_date", "endDate", "flight_end"]),
    hasSource: lineHasDeliverySource({
      group,
      publisher: rec.publisher,
      platform: rec.platform,
    }),
    bursts: rec.bursts_json ?? rec.bursts ?? null,
    buyType: asString(rec.buy_type) ?? asString(rec.buyType),
    budgetIncludesFees: rec.budget_includes_fees === true,
    versionId: versionIdFromLine(rec) ?? fallbackVersionId,
    feeChannel: channelKeyForEstimateGroup(group),
    sourceTable: origin?.sourceTable ?? "",
    mediaTypeLabel: origin?.mediaTypeLabel ?? "",
    noAdserving: rec.no_adserving === true || rec.noAdserving === true,
    publisher: asString(rec.publisher),
    platform: asString(rec.platform),
    clientPaysForMedia: rec.client_pays_for_media === true || rec.clientPaysForMedia === true,
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
  return {
    cpm: cpm(m.spendToDate, m.impressions),
    ctr: ctr(m.clicks, m.impressions),
    cpc: cpc(m.spendToDate, m.clicks),
  }
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

const DIRECT_DIGITAL_ESTIMATE_GROUPS = new Set([
  "digital_display",
  "digital_video",
  "digital_audio",
  "bvod",
])

function applyDirectDigitalEstimates(
  groups: Map<string, Map<string, PlanLineMeta>>,
  deliveredById: Map<string, ReturnType<typeof emptyMetrics>>,
  pacingRows: PacingRow[],
  fixedCostIds: ReadonlySet<string>,
  feePctsByVersionId: FeePctsByVersionId,
): Set<string> {
  const estimatedIds = new Set<string>()
  const daysByLine = new Map<string, PacingRow[]>()
  for (const row of pacingRows) {
    const id = cleanPacingLineItemId(row.lineItemId)
    if (!id) continue
    const list = daysByLine.get(id) ?? []
    list.push(row)
    daysByLine.set(id, list)
  }

  for (const group of DIRECT_DIGITAL_ESTIMATE_GROUPS) {
    const planMap = groups.get(group)
    if (!planMap) continue
    for (const [id, plan] of planMap) {
      if (fixedCostIds.has(id)) continue
      const days = (daysByLine.get(id) ?? []).map((row) => ({
        date: (row.dateDay || "").slice(0, 10) || "1970-01-01",
        impressions: row.impressions,
        clicks: row.clicks,
        results: row.results,
        video3sViews: row.video3sViews,
      }))
      const estimate = estimateDirectDigitalSpend({
        lineItemId: id,
        buyType: plan.buyType,
        budgetIncludesFees: plan.budgetIncludesFees,
        feePct: feePctFromVersionMap(feePctsByVersionId, plan.versionId, plan.feeChannel),
        versionId: plan.versionId,
        bursts: plan.bursts,
        days,
      })
      const cur = deliveredById.get(id) ?? emptyMetrics()
      if (estimate.amount == null) {
        cur.spendToDate = 0
      } else {
        cur.spendToDate = estimate.amount
        if (estimate.spendMode === "estimated" && estimate.amount > 0) estimatedIds.add(id)
      }
      deliveredById.set(id, cur)
    }
  }
  return estimatedIds
}

function pacingBursts(raw: unknown) {
  return parseBurstsToNormalised(raw).map((burst) => ({
    startDate: burst.startDate,
    endDate: burst.endDate,
    budget: burst.budget,
    mediaAmount: burst.mediaAmount ?? null,
  }))
}

function expectedNetForPlan(
  plan: PlanLineMeta,
  feePcts: FeePctsByVersionId,
  windowStart: string | undefined,
  windowEnd: string | undefined,
  asOf: string,
): number {
  return netBurstExpectedInWindow({
    bursts: pacingBursts(plan.bursts),
    budgetIncludesFees: plan.budgetIncludesFees,
    feePct: lineFeePct(plan, feePcts),
    lineBudget: plan.plannedBudget ?? 0,
    lineStart: plan.startDate,
    lineEnd: plan.endDate,
    lineItemId: plan.id,
    windowStart,
    windowEnd,
    asOf,
  })
}

function buildLines(
  planById: Map<string, PlanLineMeta>,
  deliveredById: Map<string, ReturnType<typeof emptyMetrics>>,
  factIds: ReadonlySet<string>,
  overlaySpendIds: ReadonlySet<string>,
  estimatedIds: ReadonlySet<string>,
  asOf: string,
  feePcts: FeePctsByVersionId,
  windowStart: string | undefined,
  windowEnd: string | undefined,
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
      plannedImpressions: plan?.plannedImpressions ?? null,
      plannedClicks: plan?.plannedClicks ?? null,
      plannedViews: plan?.plannedViews ?? null,
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
      expectedNetToDate: plan
        ? expectedNetForPlan(plan, feePcts, windowStart, windowEnd, asOf)
        : null,
      noDeliveryRows,
      deliveryState,
      ...(overlaySpendIds.has(id)
        ? { spendMode: "reported" as const }
        : estimatedIds.has(id)
          ? { spendMode: "estimated" as const }
          : delivered.spendToDate > 0
            ? { spendMode: "actual" as const }
            : {}),
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

const ATL_PLAN_KEYS = [
  ["television", "media_plan_television", "Television"],
  ["radio", "media_plan_radio", "Radio"],
  ["newspaper", "media_plan_newspaper", "Newspaper"],
  ["magazines", "media_plan_magazines", "Magazines"],
  ["ooh", "media_plan_ooh", "OOH"],
  ["cinema", "media_plan_cinema", "Cinema"],
] as const

const DIGITAL_PLAN_ORIGIN: Record<string, { sourceTable: string; mediaTypeLabel: string }> = {
  digital_display: { sourceTable: "media_plan_digi_display", mediaTypeLabel: "Digital Display" },
  digital_video: { sourceTable: "media_plan_digi_video", mediaTypeLabel: "Digital Video" },
  digital_audio: { sourceTable: "media_plan_digi_audio", mediaTypeLabel: "Digital Audio" },
  bvod: { sourceTable: "media_plan_digi_bvod", mediaTypeLabel: "BVOD" },
}

function burstRecords(raw: unknown): Record<string, unknown>[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) list = parsed
    } catch {
      list = []
    }
  }
  return list.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
}

function lineFeePct(plan: PlanLineMeta, feePctsByVersionId: FeePctsByVersionId): number {
  return plan.mediaTypeLabel
    ? feePctForScheduleMedia(feePctsByVersionId, plan.versionId, plan.mediaTypeLabel)
    : 0
}

function deliveryMediaCentsForPlan(plan: PlanLineMeta, feePct: number): number {
  let media = 0
  for (const burst of burstRecords(plan.bursts)) {
    const rawBudget = parseMoney(burst.budget ?? burst.mediaAmount ?? burst.media_amount) ?? 0
    const amounts = computeBurstAmounts({
      rawBudget,
      budgetIncludesFees: plan.budgetIncludesFees,
      clientPaysForMedia: plan.clientPaysForMedia,
      feePct,
      buyType: asString(burst.buy_type) ?? asString(burst.buyType) ?? plan.buyType ?? undefined,
    })
    if (amounts.deliveryMediaAmount > 0) media += amounts.deliveryMediaAmount
  }
  return toCents(media)
}

function expectedLineFromPlan(plan: PlanLineMeta, feePct: number): AssumedExpectedLine | null {
  const meta = channelMetaForKey(plan.sourceTable)
  if (!meta) return null
  const bursts = burstRecords(plan.bursts).flatMap((burst) => {
    const startDate = String(burst.startDate ?? burst.start_date ?? "").slice(0, 10)
    const endDate = String(burst.endDate ?? burst.end_date ?? "").slice(0, 10)
    if (!startDate || !endDate) return []
    const rawBudget = parseMoney(burst.budget ?? burst.mediaAmount ?? burst.media_amount) ?? 0
    return [
      {
        rawBudget,
        budgetIncludesFees: plan.budgetIncludesFees,
        clientPaysForMedia: plan.clientPaysForMedia,
        feePct,
        buyType: asString(burst.buy_type) ?? asString(burst.buyType) ?? plan.buyType ?? undefined,
        startDate,
        endDate,
      },
    ]
  })
  return assumedExpectedLineFromFields(
    {
      id: plan.id,
      buyType: plan.buyType,
      sourceTable: plan.sourceTable,
      noAdserving: plan.noAdserving,
      publisher: plan.publisher,
      platform: plan.platform,
      budgetIncludesFees: plan.budgetIncludesFees,
      clientPaysForMedia: plan.clientPaysForMedia,
      feePct,
      bursts,
    },
    meta.scheduleKey,
  )
}

function planCanAssumeSpend(plan: PlanLineMeta, feePct: number): boolean {
  return assumeSpendForSnapshotLine({
    buyType: plan.buyType,
    sourceTable: plan.sourceTable,
    noAdserving: plan.noAdserving,
    publisher: plan.publisher,
    platform: plan.platform,
    deliveryMediaCents: deliveryMediaCentsForPlan(plan, feePct),
  })
}

function assumedSpendDollars(
  plan: PlanLineMeta,
  feePct: number,
  windowStart: string | undefined,
  windowEnd: string | undefined,
  asOf: string,
): number {
  const cap = windowEnd && windowEnd < asOf ? windowEnd : asOf
  let cents = 0
  for (const burst of burstRecords(plan.bursts)) {
    const rawBudget = parseMoney(burst.budget ?? burst.mediaAmount ?? burst.media_amount) ?? 0
    const startDate = String(burst.startDate ?? burst.start_date ?? "")
    const endDate = String(burst.endDate ?? burst.end_date ?? "")
    if (!startDate || !endDate) continue
    const days = assumedSpendForBurst({
      rawBudget,
      budgetIncludesFees: plan.budgetIncludesFees,
      clientPaysForMedia: plan.clientPaysForMedia,
      feePct,
      buyType: asString(burst.buy_type) ?? asString(burst.buyType) ?? plan.buyType ?? undefined,
      startDate,
      endDate,
      asOfDate: cap,
    })
    for (const day of days) {
      if (windowStart && day.date < windowStart) continue
      cents += day.cents
    }
  }
  return fromCents(cents)
}

function assumedSnapshotLine(plan: PlanLineMeta, spend: number): DeliveryLineSnapshot {
  return {
    lineItemId: plan.id,
    name: plan.name,
    plannedBudget: plan.plannedBudget,
    plannedUnits: plan.plannedUnits,
    plannedImpressions: plan.plannedImpressions,
    plannedClicks: plan.plannedClicks,
    plannedViews: plan.plannedViews,
    startDate: plan.startDate,
    endDate: plan.endDate,
    spendToDate: spend,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    cpm: null,
    ctr: null,
    cpc: null,
    expectedSpendToDate: spend,
    expectedNetToDate: spend,
    noDeliveryRows: true,
    deliveryState: "assumed",
    spendMode: "assumed",
  }
}

function collectChannelPlans(
  byChannel: Record<string, MediaContainerLineItem[]>,
  fallbackVersionId: number | null,
): {
  groups: Map<string, Map<string, PlanLineMeta>>
  allMetas: PlanLineMeta[]
  assumedOffline: PlanLineMeta[]
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
    const meta = toPlanLineMeta(item, group, fallbackVersionId)
    if (!meta) continue
    allMetas.push(meta)
    ensure(group).set(meta.id, meta)
  }

  for (const item of byChannel.progDisplay ?? []) {
    const meta = toPlanLineMeta(item, "programmatic_display", fallbackVersionId)
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_display").set(meta.id, meta)
  }

  for (const item of byChannel.progVideo ?? []) {
    const meta = toPlanLineMeta(item, "programmatic_video", fallbackVersionId)
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_video").set(meta.id, meta)
  }

  for (const item of [...(byChannel.progOoh ?? []), ...(byChannel.progOOH ?? [])]) {
    const meta = toPlanLineMeta(item, "programmatic_ooh", fallbackVersionId)
    if (!meta) continue
    allMetas.push(meta)
    ensure("programmatic_ooh").set(meta.id, meta)
  }

  const ingestDirectDigital = (keys: readonly string[], group: string) => {
    const origin = DIGITAL_PLAN_ORIGIN[group]
    for (const key of keys) {
      for (const item of byChannel[key] ?? []) {
        const meta = toPlanLineMeta(item, group, fallbackVersionId, origin)
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

  const assumedOffline: PlanLineMeta[] = []
  for (const [key, sourceTable, mediaTypeLabel] of ATL_PLAN_KEYS) {
    for (const item of byChannel[key] ?? []) {
      const meta = toPlanLineMeta(item, "assumed_spend", fallbackVersionId, {
        sourceTable,
        mediaTypeLabel,
      })
      if (!meta) continue
      allMetas.push(meta)
      assumedOffline.push(meta)
    }
  }

  for (const item of byChannel.search ?? []) {
    const meta = toPlanLineMeta(item, "search", fallbackVersionId)
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
    assumedOffline,
    searchIds,
    nonSearchIds: [...nonSearchIds].sort(),
  }
}

async function feePctsForDirectDigital(
  provided: FeePctsByVersionId | undefined,
  versionIds: number[],
): Promise<FeePctsByVersionId> {
  if (provided) return provided
  if (versionIds.length === 0) return {}
  const { loadDirectDigitalFeePcts } = await import("@/lib/delivery/readMbaFeeSnapshots")
  return loadDirectDigitalFeePcts({ versionIds })
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
  const fallbackVersionId = positiveVersionId(input.estimateVersionId)
  const { groups, allMetas, assumedOffline, searchIds, nonSearchIds } = collectChannelPlans(
    byChannel,
    fallbackVersionId,
  )
  const feeVersionIds: number[] = []
  for (const plan of allMetas) {
    if (plan.versionId != null) feeVersionIds.push(plan.versionId)
  }
  const feePctsByVersionId = await feePctsForDirectDigital(
    input.feePctsByVersionId,
    feeVersionIds,
  )
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

  let fixedCostOverlayFailed = false
  const overlayPromise =
    fixedCostLineIds.length > 0
      ? queryDailyFacts(
          fixedCostLineIds,
          snowflakeLabel ? { label: snowflakeLabel } : undefined,
        ).catch((err) => {
          fixedCostOverlayFailed = true
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

  const estimatedIds = applyDirectDigitalEstimates(
    groups,
    deliveredById,
    pacingRows,
    new Set(fixedCostLineIds),
    feePctsByVersionId,
  )

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
  const assumedLines: DeliveryLineSnapshot[] = []
  const assumedExpectedLines: AssumedExpectedLine[] = []
  const pushAssumed = (plan: PlanLineMeta, feePct: number, spend: number) => {
    assumedLines.push(assumedSnapshotLine(plan, spend))
    const expected = expectedLineFromPlan(plan, feePct)
    if (expected) assumedExpectedLines.push(expected)
  }
  for (const group of channelOrder) {
    const planMap = groups.get(group)
    if (!planMap || planMap.size === 0) continue
    if (group === "search" && !includeSearch) continue
    let lines = buildLines(
      planMap,
      deliveredById,
      factIds,
      overlaySpendIds,
      estimatedIds,
      asOf,
      feePctsByVersionId,
      startDate,
      endDate,
    )
    if (DIRECT_DIGITAL_ESTIMATE_GROUPS.has(group)) {
      const kept: DeliveryLineSnapshot[] = []
      for (const line of lines) {
        const plan = planMap.get(line.lineItemId)
        const hasDelivery =
          factIds.has(line.lineItemId) ||
          estimatedIds.has(line.lineItemId) ||
          overlaySpendIds.has(line.lineItemId)
        const feePct = plan ? lineFeePct(plan, feePctsByVersionId) : 0
        if (plan && !hasDelivery && planCanAssumeSpend(plan, feePct)) {
          const spend = assumedSpendDollars(plan, feePct, startDate, endDate, asOf)
          pushAssumed(plan, feePct, spend)
          continue
        }
        kept.push(line)
      }
      lines = kept
    }
    if (lines.length === 0) continue
    channels.push({
      group,
      lines,
      totals: sumLines(lines),
    })
  }

  for (const plan of assumedOffline) {
    const feePct = lineFeePct(plan, feePctsByVersionId)
    if (!planCanAssumeSpend(plan, feePct)) continue
    const spend = assumedSpendDollars(plan, feePct, startDate, endDate, asOf)
    pushAssumed(plan, feePct, spend)
  }
  if (assumedLines.length > 0) {
    channels.push({
      group: "assumed_spend",
      lines: assumedLines,
      totals: sumLines(assumedLines),
    })
  }

  const planTotals = sumLines(
    channels.filter((channel) => channel.group !== "assumed_spend").flatMap((c) => c.lines),
  )
  const includesEstimatedSpend = channels.some((channel) =>
    channel.lines.some((line) => line.spendMode === "estimated" && line.spendToDate > 0),
  )

  return {
    asOf,
    window: { startDate: startDate ?? null, endDate: endDate ?? null },
    mbaNumber: mba,
    versionNumber: versionNumber ?? null,
    channels,
    planTotals,
    ...(fixedCostOverlayFailed ? { fixedCostOverlayFailed: true } : {}),
    ...(includesEstimatedSpend ? { includesEstimatedSpend: true } : {}),
    assumedExpectedLines,
  }
}
