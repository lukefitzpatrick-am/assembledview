import { getMediaColor } from "@/lib/charts/registry"
import type { ChannelKey, ChannelSectionData } from "@/components/dashboard/delivery/channels/types"
import type { DeliveryStatus } from "@/components/dashboard/delivery/shared/statusColours"
import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
  type DeliverySourceMapRow,
} from "@/lib/delivery/deliverySourceMap"
import {
  extractKpiReviewPlanLine,
  type KpiReviewCoverageDraft,
  type KpiReviewPlanLine,
} from "@/lib/kpi/kpiReview"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import { extractPacingLineItemIdFromItem } from "@/lib/pacing/delivery/lineItemIds"
import { classifySocialPacingPlatform } from "@/lib/pacing/social/classifySocialPacingPlatform"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { assumedDeliveryPacePct, assumedLineToDateCents } from "@/lib/spend/assumedSpend"
import { fromCents, toCents } from "@/lib/money/cents"
import {
  allocateCents,
  labelForScheduleKey,
  scheduleKeyForCoverageKey,
  scheduleKeyForLineItemId,
} from "@/lib/spend/channelExpectedToDate"

export type ChannelCoverageStatus = "reporting" | "connecting" | "not_started" | "no_source"

export type ChannelCoverageEntry = {
  key: string
  label: string
  colour: string
  plannedSpend: number
  /** Whole-plan deliverables (information only). */
  plannedImpressions: number
  /**
   * Deliverables expected for the selected window, from the cards' numeric
   * `expected`. Null when a card has no expected figure.
   */
  expectedImpressions?: number | null
  /** Deliverables expected campaign start to Melbourne yesterday, ignoring the date filter. */
  expectedImpressionsToDate?: number | null
  /** Null when no spend card exists (no estimate and no reported overlay). */
  deliveredSpend: number | null
  deliveredImpressions: number
  status: ChannelCoverageStatus
  /** Programmatic `derive_spend_from_plan`. Direct digital estimates use `spendEstimated`. */
  spendModelled: boolean
  /** True when a dollar on this group is a CM360 direct-digital estimate. */
  spendEstimated?: boolean
  startsOn: string | null
  deliveryStatus: DeliveryStatus | null
  impressionsStatus: DeliveryStatus | null
  /** Glance noun. "Views" only when every line in the group is CPV. */
  deliverableLabel: "Impressions" | "Views"
  /** Delivery-schedule media slice at the same as-of as the campaign headline. */
  expectedToDate?: number
  /** True when the channel's dollars include assumed spend. */
  spendAssumed?: boolean
}

export type ChannelCoverageBuckets = {
  socialLineItems: unknown[]
  searchLineItems: unknown[]
  progDisplayLineItems: unknown[]
  progVideoLineItems: unknown[]
  progOohLineItems: unknown[]
  digitalDisplayLineItems: unknown[]
  digitalVideoLineItems: unknown[]
  digitalAudioLineItems: unknown[]
  bvodLineItems: unknown[]
  offlineLineItems?: unknown[]
}

export type ChannelCoverageInput = {
  buckets: ChannelCoverageBuckets
  sections: ChannelSectionData[]
  todayISO: string
  sourceMap?: readonly DeliverySourceMapRow[]
  /** Delivery-schedule slices at the same as-of as the headline. */
  channelExpected?: ReadonlyArray<{ key: string; expected: number; planned: number }>
  /** Assumed-spend lines. Their burst sum is delivered and expected on that channel. */
  assumedLines?: readonly import("@/lib/spend/assumedSpend").AssumedExpectedLine[]
  /**
   * Pacing window (filter-aware, to Melbourne yesterday). When set, assumed
   * spend counts only the window's days. Without it, assumed runs to `todayISO`.
   */
  window?: { startISO: string; endISO: string; empty?: boolean }
}

const STATUS_RANK: Record<Exclude<ChannelCoverageStatus, "no_source">, number> = {
  reporting: 0,
  connecting: 1,
  not_started: 2,
}

const PUBLISHER_LABELS: Record<string, string> = {
  dv360: "DV360",
  "youtube - dv360": "DV360",
  "youtube-dv360": "DV360",
  taboola: "Taboola",
  "native - taboola": "Taboola",
  native: "Taboola",
  "quantcast - direct": "Quantcast",
  quantcast: "Quantcast",
  "channel factory": "Channel Factory",
  twitch: "Twitch",
  vistar: "Vistar",
  broadsign: "Broadsign",
}

/** Hide spend until a card title matches /spend/i (Estimated spend or Reported spend). */
const ZERO_SPEND_FAMILIES = new Set<ChannelKey>([
  "digital-display",
  "digital-video",
  "digital-audio",
  "bvod",
])

type Family =
  | "social-meta"
  | "social-tiktok"
  | "social-reddit"
  | "search"
  | "programmatic-display"
  | "programmatic-video"
  | "programmatic-ooh"
  | "digital-display"
  | "digital-video"
  | "digital-audio"
  | "bvod"
  | "no-source"

type Acc = {
  key: string
  family: Family
  channelKey: ChannelKey
  publisherKey: string | null
  hasSource: boolean
  mapRow?: DeliverySourceMapRow
  plannedSpend: number
  plannedImpressions: number
  earliestStart: string | null
  /** Earliest burst with budget > 0. Null when every burst in the group is $0. */
  earliestPaidStart: string | null
  lineIds: string[]
  plannedSpendByLineId: Record<string, number>
  planByLineId: Record<string, KpiReviewPlanLine>
}

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

function plannedSpendFromItem(item: unknown): number {
  const rec = asRecord(item)
  const n = parseMoneyish(
    rec.totalMedia ?? rec.grossMedia ?? rec.budget ?? rec.spend ?? rec.investment ?? rec.media_investment,
  )
  return n > 0 ? n : 0
}

function plannedImpressionsFromItem(item: unknown): number {
  const rec = asRecord(item)
  const n = parseMoneyish(rec.impressions ?? rec.plannedImpressions ?? rec.units ?? rec.quantity)
  return n > 0 ? n : 0
}

function earlierDate(current: string | null, next: string | null): string | null {
  if (!next) return current
  if (!current || next < current) return next
  return current
}

/**
 * Burst dates are already Sydney civil days (`formatBurstDateLocal` inside
 * `parseBurstsToNormalised`). Date-only strings pass through. An instant such
 * as `2026-10-04T13:00:00.000Z` is 5 Oct. Callers compare those days with
 * Melbourne today (`getMelbourneTodayISO`) as `YYYY-MM-DD`.
 */
function burstStartBounds(item: unknown): { earliest: string | null; earliestPaid: string | null } {
  const rec = asRecord(item)
  const bursts = parseBurstsToNormalised(rec.bursts ?? rec.bursts_json)
  let earliest: string | null = null
  let earliestPaid: string | null = null
  for (const burst of bursts) {
    earliest = earlierDate(earliest, burst.startDate)
    if (burst.budget > 0) earliestPaid = earlierDate(earliestPaid, burst.startDate)
  }
  return { earliest, earliestPaid }
}

function titleCasePublisher(key: string): string {
  return key
    .split(/\s+/)
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ")
}

function publisherLabel(publisherKey: string | null): string {
  if (!publisherKey) return ""
  return PUBLISHER_LABELS[publisherKey] ?? titleCasePublisher(publisherKey)
}

function groupLabel(family: Family, publisherKey: string | null): string {
  switch (family) {
    case "social-meta":
      return "Social · Meta"
    case "social-tiktok":
      return "Social · TikTok"
    case "social-reddit":
      return "Social · Reddit"
    case "search":
      return "Search"
    case "programmatic-display":
      return `Prog Display · ${publisherLabel(publisherKey)}`.trim()
    case "programmatic-video":
      return `Prog Video · ${publisherLabel(publisherKey)}`.trim()
    case "programmatic-ooh":
      return `Programmatic OOH · ${publisherLabel(publisherKey)}`.trim()
    case "digital-display":
      return "Digital Display"
    case "digital-video":
      return "Digital Video"
    case "digital-audio":
      return "Digital Audio"
    case "bvod":
      return "BVOD"
    case "no-source":
      return "Awaiting delivery"
  }
}

function familyChannelKey(family: Family): ChannelKey {
  if (family === "no-source") return "plan-only"
  return family
}

function coverageColour(key: ChannelKey): string {
  switch (key) {
    case "social-meta":
    case "social-tiktok":
    case "social-reddit":
    case "plan-only":
      return getMediaColor("socialmedia")
    case "search":
      return getMediaColor("search")
    case "programmatic-display":
      return getMediaColor("prog_display")
    case "programmatic-video":
      return getMediaColor("prog_video")
    case "programmatic-ooh":
      return getMediaColor("prog_ooh")
    case "digital-display":
      return getMediaColor("digital_display")
    case "digital-video":
      return getMediaColor("digital_video")
    case "digital-audio":
      return getMediaColor("digital_audio")
    case "bvod":
      return getMediaColor("bvod")
    case "assumed-spend":
      return getMediaColor("television")
  }
}

function programmaticFamily(bucket: "display" | "video" | "ooh"): Family {
  if (bucket === "display") return "programmatic-display"
  if (bucket === "video") return "programmatic-video"
  return "programmatic-ooh"
}

function addLine(
  groups: Map<string, Acc>,
  args: {
    item: unknown
    family: Family
    hasSource: boolean
    publisherKey?: string | null
    mapRow?: DeliverySourceMapRow
  },
) {
  const publisherKey = args.publisherKey ?? null
  const key =
    args.family === "no-source"
      ? "no-source"
      : publisherKey
        ? `${args.family}:${publisherKey}`
        : args.family
  const existing = groups.get(key)
  const bounds = burstStartBounds(args.item)
  const start = bounds.earliest
  const lineId = extractPacingLineItemIdFromItem(args.item)
  const planned = plannedSpendFromItem(args.item)
  const planLine = extractKpiReviewPlanLine(args.item, planned)
  if (!existing) {
    groups.set(key, {
      key,
      family: args.family,
      channelKey: familyChannelKey(args.family),
      publisherKey,
      hasSource: args.hasSource,
      mapRow: args.mapRow,
      plannedSpend: planned,
      plannedImpressions: plannedImpressionsFromItem(args.item),
      earliestStart: start,
      earliestPaidStart: bounds.earliestPaid,
      lineIds: lineId ? [lineId] : [],
      plannedSpendByLineId: lineId ? { [lineId]: planned } : {},
      planByLineId: lineId ? { [lineId]: planLine } : {},
    })
    return
  }
  existing.plannedSpend += planned
  existing.plannedImpressions += plannedImpressionsFromItem(args.item)
  existing.earliestStart = earlierDate(existing.earliestStart, start)
  existing.earliestPaidStart = earlierDate(existing.earliestPaidStart, bounds.earliestPaid)
  if (lineId) {
    if (!existing.lineIds.includes(lineId)) existing.lineIds.push(lineId)
    existing.plannedSpendByLineId[lineId] = (existing.plannedSpendByLineId[lineId] ?? 0) + planned
    existing.planByLineId[lineId] = planLine
  }
  existing.hasSource = existing.hasSource || args.hasSource
  if (!existing.mapRow && args.mapRow) existing.mapRow = args.mapRow
}

function chartHasFactRow(chart: ChannelSectionData["lineItems"][number]["block"]["chart"] | ChannelSectionData["aggregate"]["chart"]): boolean {
  const daily = Array.isArray((chart as { daily?: unknown }).daily)
    ? ((chart as { daily: Array<Record<string, string | number>> }).daily ?? [])
    : []
  return daily.length > 0
}

function parseCardValue(value: string | undefined): number {
  if (!value) return 0
  if (value.includes("—") || value.trim() === "-") return 0
  return parseMoneyish(value)
}

/** A progress card as coverage reads it. Numeric fields win over the detail text. */
type CoverageCard = {
  title?: string
  detail?: string
  value?: string
  status?: DeliveryStatus
  expected?: number
  expectedToDate?: number
  plannedTotal?: number
}

/** Legacy "Delivered X · Planned Y" detail — Y is the line's planned deliverable. */
function parsePlannedFromDetail(detail: string | undefined): number {
  if (!detail) return 0
  const match = detail.match(/Planned\s+(.+?)\s*$/i)
  if (!match?.[1]) return 0
  return parseMoneyish(match[1])
}

function isViewsCardTitle(title: string | undefined): boolean {
  if (!title) return false
  return /\bviews?\b/i.test(title)
}

function isSpendCardTitle(title: string | undefined): boolean {
  return Boolean(title && /spend/i.test(title))
}

function isDeliverableCardTitle(title: string | undefined): boolean {
  if (!title) return false
  return isViewsCardTitle(title) || /impressions/i.test(title)
}

/** Direct digital adapters put impressions at [0] (clicks at [1]). Spend families put the deliverable at [1]. */
function deliverableCardIndex(acc: Acc): number {
  return ZERO_SPEND_FAMILIES.has(acc.channelKey) ? 0 : 1
}

function pickSpendCard(
  cards: Array<CoverageCard>,
) {
  return cards.find((card) => isSpendCardTitle(card.title))
}

function pickDeliverableCard(
  acc: Acc,
  cards: Array<CoverageCard>,
) {
  if (pickSpendCard(cards)) {
    return cards.find((card) => isDeliverableCardTitle(card.title)) ?? cards[1]
  }
  return cards[deliverableCardIndex(acc)]
}

function deliverableCardsForGroup(
  acc: Acc,
  section: ChannelSectionData | undefined,
): Array<CoverageCard> {
  if (!section) return []
  const subset = matchingLineItems(section, acc.lineIds)
  if (subset.length > 0) {
    return subset.map((row) => pickDeliverableCard(acc, row.block.progressCards) ?? {})
  }
  return [pickDeliverableCard(acc, section.aggregate.progressCards) ?? {}]
}

/** Sum of the deliverable cards' numeric expected. Null when any card lacks one. */
function expectedDeliverablesFromCards(
  acc: Acc,
  section: ChannelSectionData | undefined,
  field: "expected" | "expectedToDate",
): number | null {
  const cards = deliverableCardsForGroup(acc, section)
  if (cards.length === 0) return null
  let total = 0
  for (const card of cards) {
    const value = card[field]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    total += value
  }
  return total
}

function plannedDeliverablesFromCards(acc: Acc, section: ChannelSectionData | undefined): number {
  let total = 0
  for (const card of deliverableCardsForGroup(acc, section)) {
    const planned =
      typeof card.plannedTotal === "number" && Number.isFinite(card.plannedTotal)
        ? card.plannedTotal
        : parsePlannedFromDetail(card.detail)
    if (planned > 0) total += planned
  }
  return total
}

function deliverableLabelFromCards(
  acc: Acc,
  section: ChannelSectionData | undefined,
): ChannelCoverageEntry["deliverableLabel"] {
  const cards = deliverableCardsForGroup(acc, section)
  if (cards.length > 0 && cards.every((card) => isViewsCardTitle(card.title))) return "Views"
  return "Impressions"
}

function matchingLineItems(section: ChannelSectionData | undefined, lineIds: string[]) {
  if (!section) return []
  const idSet = new Set(lineIds)
  return section.lineItems.filter((row) => idSet.has(String(row.id).trim().toLowerCase()))
}

function sectionForFamily(sections: ChannelSectionData[], family: Family): ChannelSectionData | undefined {
  if (family === "no-source") return sections.find((s) => s.key === "plan-only")
  return sections.find((s) => s.key === family)
}

function groupHasFactRows(acc: Acc, section: ChannelSectionData | undefined): boolean {
  if (!section) return false
  const subset = matchingLineItems(section, acc.lineIds)
  if (subset.length > 0) {
    return subset.some((row) => chartHasFactRow(row.block.chart))
  }
  if (acc.publisherKey) return false
  return chartHasFactRow(section.aggregate.chart)
}

function deliveredFromCards(
  acc: Acc,
  section: ChannelSectionData | undefined,
): {
  spend: number
  impressions: number
  deliveryStatus: DeliveryStatus | null
  impressionsStatus: DeliveryStatus | null
} {
  if (!section) {
    return { spend: 0, impressions: 0, deliveryStatus: null, impressionsStatus: null }
  }
  const subset = matchingLineItems(section, acc.lineIds)
  const hideSpend = spendHidden(acc, section)
  const cardSets =
    subset.length > 0
      ? subset.map((row) => row.block.progressCards)
      : [section.aggregate.progressCards]
  let spend = 0
  let impressions = 0
  let deliveryStatus: DeliveryStatus | null = null
  let impressionsStatus: DeliveryStatus | null = null
  for (const cards of cardSets) {
    const spendCard =
      pickSpendCard(cards) ?? (ZERO_SPEND_FAMILIES.has(acc.channelKey) ? undefined : cards[0])
    const deliverableCard = pickDeliverableCard(acc, cards)
    spend += parseCardValue(spendCard?.value)
    impressions += parseCardValue(deliverableCard?.value)
    const status = hideSpend ? deliverableCard?.status : spendCard?.status
    if (status && status !== "no-data") deliveryStatus = status
    if (deliverableCard?.status && deliverableCard.status !== "no-data") {
      impressionsStatus = deliverableCard.status
    }
  }
  return {
    spend,
    impressions,
    deliveryStatus,
    impressionsStatus,
  }
}

function groupHasEstimatedSpend(acc: Acc, section: ChannelSectionData | undefined): boolean {
  if (!section) return false
  const subset = matchingLineItems(section, acc.lineIds)
  const cards =
    subset.length > 0
      ? subset.flatMap((row) => row.block.progressCards)
      : section.aggregate.progressCards
  return cards.some((card) => /estimated/i.test(card.title))
}

function groupHasReportedSpend(acc: Acc, section: ChannelSectionData | undefined): boolean {
  if (!section) return false
  const subset = matchingLineItems(section, acc.lineIds)
  const cards =
    subset.length > 0
      ? subset.flatMap((row) => row.block.progressCards)
      : section.aggregate.progressCards
  return cards.some((card) => isSpendCardTitle(card.title))
}

function spendHidden(acc: Acc, section?: ChannelSectionData): boolean {
  if (groupHasReportedSpend(acc, section)) return false
  if (ZERO_SPEND_FAMILIES.has(acc.channelKey)) return true
  if (acc.mapRow?.delivery_source === "cm360" && acc.mapRow.derive_spend_from_plan !== true) return true
  return false
}

function resolveStatus(acc: Acc, hasFacts: boolean, todayISO: string): ChannelCoverageStatus {
  if (hasFacts) return "reporting"
  if (!acc.hasSource) return "no_source"
  if (acc.earliestStart && acc.earliestStart > todayISO) return "not_started"
  return "connecting"
}

export function visibleCoverageCards(
  entries: ChannelCoverageEntry[],
  todayISO?: string,
): ChannelCoverageEntry[] {
  const kept = entries.filter((entry) => {
    if (entry.status !== "no_source") return true
    if ((entry.expectedToDate ?? 0) > 0) return true
    if (todayISO && entry.startsOn && entry.startsOn > todayISO) return true
    return false
  })
  if (!kept.some((entry) => (entry.expectedToDate ?? 0) > 0)) return kept
  return kept.toSorted(
    (a, b) => (b.expectedToDate ?? 0) - (a.expectedToDate ?? 0) || b.plannedSpend - a.plannedSpend,
  )
}

export function coverageReportingCounts(entries: ChannelCoverageEntry[]): {
  channelsReporting: number
  channelsTotal: number
} {
  const cards = visibleCoverageCards(entries)
  return {
    channelsReporting: cards.filter((entry) => entry.status === "reporting").length,
    channelsTotal: cards.length,
  }
}

/**
 * Deliverables expected campaign start to Melbourne yesterday on reporting
 * channels (no date filter). Null when no reporting card carries the figure.
 */
export function sumReportingExpectedImpressionsToDate(entries: ChannelCoverageEntry[]): number | null {
  let total = 0
  let seen = false
  for (const entry of visibleCoverageCards(entries)) {
    if (entry.status !== "reporting") continue
    const value = entry.expectedImpressionsToDate
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    seen = true
    total += value
  }
  return seen ? total : null
}

export function sumReportingPlannedImpressions(entries: ChannelCoverageEntry[]): number {
  let total = 0
  for (const entry of visibleCoverageCards(entries)) {
    if (entry.status !== "reporting") continue
    if (Number.isFinite(entry.plannedImpressions) && entry.plannedImpressions > 0) {
      total += entry.plannedImpressions
    }
  }
  return total
}

export function firstAheadChannelName(entries: ChannelCoverageEntry[]): string | null {
  for (const entry of visibleCoverageCards(entries)) {
    if (entry.status === "reporting" && entry.deliveryStatus === "ahead") return entry.label
  }
  return null
}

function collectCoverageGroups(input: ChannelCoverageInput): Map<string, Acc> {
  const sourceMap = input.sourceMap
  const groups = new Map<string, Acc>()

  for (const item of input.buckets.socialLineItems ?? []) {
    const platform = classifySocialPacingPlatform(asRecord(item))
    if (platform === "meta") {
      addLine(groups, { item, family: "social-meta", hasSource: true })
    } else if (platform === "tiktok") {
      addLine(groups, { item, family: "social-tiktok", hasSource: true })
    } else if (platform === "reddit") {
      addLine(groups, { item, family: "social-reddit", hasSource: true })
    } else {
      addLine(groups, { item, family: "no-source", hasSource: false })
    }
  }

  for (const item of input.buckets.searchLineItems ?? []) {
    addLine(groups, { item, family: "search", hasSource: true })
  }

  const progBuckets: Array<{ items: unknown[]; bucket: "display" | "video" | "ooh" }> = [
    { items: input.buckets.progDisplayLineItems ?? [], bucket: "display" },
    { items: input.buckets.progVideoLineItems ?? [], bucket: "video" },
    { items: input.buckets.progOohLineItems ?? [], bucket: "ooh" },
  ]
  for (const { items, bucket } of progBuckets) {
    for (const item of items) {
      const rec = asRecord(item)
      const publisherKey = deliverySourceLookupKey(rec.publisher, rec.platform)
      const mapRow = lookupActiveDeliverySource(publisherKey, sourceMap)
      if (mapRow) {
        addLine(groups, {
          item,
          family: programmaticFamily(bucket),
          hasSource: true,
          publisherKey,
          mapRow,
        })
      } else {
        addLine(groups, { item, family: "no-source", hasSource: false, publisherKey: publisherKey || null })
      }
    }
  }

  const direct: Array<{ items: unknown[]; family: Family }> = [
    { items: input.buckets.digitalDisplayLineItems ?? [], family: "digital-display" },
    { items: input.buckets.digitalVideoLineItems ?? [], family: "digital-video" },
    { items: input.buckets.digitalAudioLineItems ?? [], family: "digital-audio" },
    { items: input.buckets.bvodLineItems ?? [], family: "bvod" },
  ]
  for (const { items, family } of direct) {
    for (const item of items) {
      const rec = asRecord(item)
      const publisherKey = deliverySourceLookupKey(rec.publisher, rec.platform)
      const mapRow = lookupActiveDeliverySource(publisherKey, sourceMap)
      addLine(groups, {
        item,
        family,
        hasSource: Boolean(mapRow),
        mapRow,
      })
    }
  }

  return groups
}

function entriesFromGroups(groups: Map<string, Acc>, input: ChannelCoverageInput): ChannelCoverageEntry[] {
  const entries: ChannelCoverageEntry[] = []
  for (const acc of groups.values()) {
    const section = sectionForFamily(input.sections, acc.family)
    const hasFacts = groupHasFactRows(acc, section)
    const delivered = deliveredFromCards(acc, section)
    const status = resolveStatus(acc, hasFacts, input.todayISO)
    const hideSpend = spendHidden(acc, section)
    const modelled = acc.mapRow?.derive_spend_from_plan === true
    const spendEstimated = groupHasEstimatedSpend(acc, section)
    const plannedFromSection = plannedDeliverablesFromCards(acc, section)
    const expectedImpressions = expectedDeliverablesFromCards(acc, section, "expected")
    const expectedImpressionsToDate = expectedDeliverablesFromCards(acc, section, "expectedToDate")
    entries.push({
      key: acc.key,
      label: groupLabel(acc.family, acc.publisherKey),
      colour: coverageColour(acc.channelKey),
      plannedSpend: acc.plannedSpend,
      plannedImpressions: plannedFromSection > 0 ? plannedFromSection : acc.plannedImpressions,
      expectedImpressions,
      expectedImpressionsToDate,
      deliverableLabel: deliverableLabelFromCards(acc, section),
      deliveredSpend: hideSpend ? null : delivered.spend,
      deliveredImpressions: delivered.impressions,
      status,
      spendModelled: modelled,
      ...(spendEstimated ? { spendEstimated: true } : {}),
      startsOn: acc.earliestPaidStart ?? acc.earliestStart,
      deliveryStatus: status === "reporting" ? delivered.deliveryStatus : null,
      impressionsStatus: status === "reporting" ? delivered.impressionsStatus : null,
    })
  }

  entries.sort((a, b) => {
    const rankA = a.status === "no_source" ? 99 : STATUS_RANK[a.status]
    const rankB = b.status === "no_source" ? 99 : STATUS_RANK[b.status]
    if (rankA !== rankB) return rankA - rankB
    return b.plannedSpend - a.plannedSpend
  })

  const assumedRange = input.window ?? { startISO: null, endISO: input.todayISO }
  appendOfflineEntries(entries, input.buckets.offlineLineItems ?? [], input.assumedLines, assumedRange)
  stampChannelExpected(entries, input.channelExpected, input.assumedLines, assumedRange)

  return entries
}

type AssumedRange = { startISO: string | null; endISO: string; empty?: boolean }

function dayBeforeISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

/** Assumed spend for a schedule key over the range (start to end, or everything to end). */
function assumedToDateForKey(
  lines: ChannelCoverageInput["assumedLines"],
  key: string,
  range: AssumedRange,
): number {
  if (range.empty) return 0
  let cents = 0
  for (const line of lines ?? []) {
    if (line.scheduleKey !== key) continue
    cents += assumedLineToDateCents(line, range.endISO)
    if (range.startISO) cents -= assumedLineToDateCents(line, dayBeforeISO(range.startISO))
  }
  return fromCents(Math.max(0, cents))
}

function appendOfflineEntries(
  entries: ChannelCoverageEntry[],
  items: unknown[],
  assumedLines: ChannelCoverageInput["assumedLines"],
  asOf: AssumedRange,
): void {
  const claimed = new Set(
    entries.flatMap((entry) => {
      const key = scheduleKeyForCoverageKey(entry.key)
      return key ? [key] : []
    }),
  )
  const groups = new Map<string, { planned: number; start: string | null; paidStart: string | null }>()
  for (const item of items) {
    const lineId = extractPacingLineItemIdFromItem(item)
    const key = lineId ? scheduleKeyForLineItemId(lineId) : null
    if (!key || claimed.has(key)) continue
    const planned = plannedSpendFromItem(item)
    const bounds = burstStartBounds(item)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { planned, start: bounds.earliest, paidStart: bounds.earliestPaid })
      continue
    }
    existing.planned += planned
    existing.start = earlierDate(existing.start, bounds.earliest)
    existing.paidStart = earlierDate(existing.paidStart, bounds.earliestPaid)
  }
  for (const [key, bucket] of groups) {
    const delivered = assumedToDateForKey(assumedLines, key, asOf)
    const card = offlineCard(key, bucket.planned, bucket.paidStart ?? bucket.start, true)
    card.deliveredSpend = delivered
    card.status = "reporting"
    card.deliveryStatus = deliveryStatusFromPct(assumedDeliveryPacePct(delivered, delivered))
    entries.push(card)
  }
}

function offlineCard(
  key: string,
  plannedSpend: number,
  startsOn: string | null,
  spendAssumed: boolean,
): ChannelCoverageEntry {
  return {
    key,
    label: labelForScheduleKey(key),
    colour: getMediaColor(key === "newspaper" ? "newspaper" : key),
    plannedSpend,
    plannedImpressions: 0,
    deliveredSpend: spendAssumed ? 0 : null,
    deliveredImpressions: 0,
    status: "no_source",
    spendModelled: false,
    spendAssumed,
    startsOn,
    deliveryStatus: null,
    impressionsStatus: null,
    deliverableLabel: "Impressions",
  }
}

function stampChannelExpected(
  entries: ChannelCoverageEntry[],
  slices: ChannelCoverageInput["channelExpected"],
  assumedLines: ChannelCoverageInput["assumedLines"],
  asOf: AssumedRange,
): void {
  if (!slices || slices.length === 0) return
  const groups = new Map<string, ChannelCoverageEntry[]>()
  for (const entry of entries) {
    const key = scheduleKeyForCoverageKey(entry.key)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(entry)
    groups.set(key, list)
  }
  for (const slice of slices) {
    const members = groups.get(slice.key) ?? []
    const assumedToDate = assumedToDateForKey(assumedLines, slice.key, asOf)
    const assumedOnly = members.length > 0 && members.every((member) => member.spendAssumed)
    if (!(slice.expected > 0) && !assumedOnly && !(assumedToDate > 0)) continue
    if (members.length === 0) {
      if (!(slice.expected > 0)) continue
      const card = offlineCard(slice.key, slice.planned, null, false)
      card.expectedToDate = slice.expected
      entries.push(card)
      continue
    }
    if (assumedOnly) {
      const parts = allocateCents(
        toCents(slice.expected),
        members.map((member) => (member.plannedSpend > 0 ? member.plannedSpend : 1)),
      )
      members.forEach((member, index) => {
        member.expectedToDate = fromCents(parts[index] ?? 0)
        member.status = "reporting"
        member.deliveryStatus = deliveryStatusFromPct(
          assumedDeliveryPacePct(member.deliveredSpend ?? 0, member.expectedToDate ?? 0),
        )
      })
      continue
    }
    if (!(slice.expected > 0) && !(assumedToDate > 0)) continue
    const parts = allocateCents(
      toCents(slice.expected),
      members.map((member) => member.plannedSpend),
    )
    members.forEach((member, index) => {
      member.expectedToDate = fromCents(parts[index] ?? 0)
      if (members.length === 1 && !member.spendAssumed && assumedToDate > 0) {
        member.deliveredSpend = (member.deliveredSpend ?? 0) + assumedToDate
      }
      if ((member.expectedToDate ?? 0) > 0 && member.deliveredSpend != null) {
        const pct =
          member.spendAssumed || assumedToDate > 0
            ? assumedDeliveryPacePct(member.deliveredSpend, member.expectedToDate)
            : (member.deliveredSpend / member.expectedToDate) * 100
        member.deliveryStatus = deliveryStatusFromPct(pct)
      } else if (member.spendAssumed) {
        member.deliveryStatus = deliveryStatusFromPct(
          assumedDeliveryPacePct(member.deliveredSpend ?? 0, member.expectedToDate ?? 0),
        )
      }
    })
  }
}

function draftsFromGroups(groups: Map<string, Acc>): KpiReviewCoverageDraft[] {
  return [...groups.values()].map((acc) => ({
    key: acc.key,
    label: groupLabel(acc.family, acc.publisherKey),
    colour: coverageColour(acc.channelKey),
    family: acc.family,
    deliverySource: acc.mapRow?.delivery_source,
    lineItemIds: [...acc.lineIds],
    plannedSpendByLineId: { ...acc.plannedSpendByLineId },
    planByLineId: { ...acc.planByLineId },
  }))
}

export function channelCoverageBundle(input: ChannelCoverageInput): {
  entries: ChannelCoverageEntry[]
  kpiDrafts: KpiReviewCoverageDraft[]
} {
  const groups = collectCoverageGroups(input)
  return {
    entries: entriesFromGroups(groups, input),
    kpiDrafts: draftsFromGroups(groups),
  }
}

export function channelCoverage(input: ChannelCoverageInput): ChannelCoverageEntry[] {
  return channelCoverageBundle(input).entries
}
