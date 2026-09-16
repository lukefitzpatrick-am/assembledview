import { getMediaColor } from "@/lib/charts/registry"
import type { ChannelKey, ChannelSectionData } from "@/components/dashboard/delivery/channels/types"
import type { DeliveryStatus } from "@/components/dashboard/delivery/shared/statusColours"
import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
  type DeliverySourceMapRow,
} from "@/lib/delivery/deliverySourceMap"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import { extractPacingLineItemIdFromItem } from "@/lib/pacing/delivery/lineItemIds"
import { classifySocialPacingPlatform } from "@/lib/pacing/social/classifySocialPacingPlatform"

export type ChannelCoverageStatus = "reporting" | "connecting" | "not_started" | "no_source"

export type ChannelCoverageEntry = {
  key: string
  label: string
  colour: string
  plannedSpend: number
  plannedImpressions: number
  /** Null when ZERO-$ LAW hides spend (CM360 without derive_spend_from_plan). */
  deliveredSpend: number | null
  deliveredImpressions: number
  status: ChannelCoverageStatus
  spendModelled: boolean
  startsOn: string | null
  deliveryStatus: DeliveryStatus | null
  impressionsStatus: DeliveryStatus | null
  /** Glance noun. "Views" only when every line in the group is CPV. */
  deliverableLabel: "Impressions" | "Views"
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
}

export type ChannelCoverageInput = {
  buckets: ChannelCoverageBuckets
  sections: ChannelSectionData[]
  todayISO: string
  sourceMap?: readonly DeliverySourceMapRow[]
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
  lineIds: string[]
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

function earliestBurstStart(item: unknown): string | null {
  const rec = asRecord(item)
  const bursts = parseBurstsToNormalised(rec.bursts ?? rec.bursts_json)
  if (bursts.length === 0) return null
  let earliest: string | null = null
  for (const burst of bursts) {
    if (!earliest || burst.startDate < earliest) earliest = burst.startDate
  }
  return earliest
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
  const start = earliestBurstStart(args.item)
  const lineId = extractPacingLineItemIdFromItem(args.item)
  if (!existing) {
    groups.set(key, {
      key,
      family: args.family,
      channelKey: familyChannelKey(args.family),
      publisherKey,
      hasSource: args.hasSource,
      mapRow: args.mapRow,
      plannedSpend: plannedSpendFromItem(args.item),
      plannedImpressions: plannedImpressionsFromItem(args.item),
      earliestStart: start,
      lineIds: lineId ? [lineId] : [],
    })
    return
  }
  existing.plannedSpend += plannedSpendFromItem(args.item)
  existing.plannedImpressions += plannedImpressionsFromItem(args.item)
  if (start && (!existing.earliestStart || start < existing.earliestStart)) {
    existing.earliestStart = start
  }
  if (lineId && !existing.lineIds.includes(lineId)) existing.lineIds.push(lineId)
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

/** "Delivered X · Planned Y" — Y is the line's planned deliverable. */
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

/** Direct digital adapters put impressions at [0] (clicks at [1]). Spend families put the deliverable at [1]. */
function deliverableCardIndex(acc: Acc): number {
  return ZERO_SPEND_FAMILIES.has(acc.channelKey) ? 0 : 1
}

function deliverableCardsForGroup(
  acc: Acc,
  section: ChannelSectionData | undefined,
): Array<{ title?: string; detail?: string; value?: string; status?: DeliveryStatus }> {
  if (!section) return []
  const subset = matchingLineItems(section, acc.lineIds)
  const idx = deliverableCardIndex(acc)
  if (subset.length > 0) {
    return subset.map((row) => row.block.progressCards[idx] ?? {})
  }
  return [section.aggregate.progressCards[idx] ?? {}]
}

function plannedDeliverablesFromCards(acc: Acc, section: ChannelSectionData | undefined): number {
  let total = 0
  for (const card of deliverableCardsForGroup(acc, section)) {
    const planned = parsePlannedFromDetail(card.detail)
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
  const deliverableIdx = deliverableCardIndex(acc)
  if (subset.length > 0) {
    let spend = 0
    let impressions = 0
    let deliveryStatus: DeliveryStatus | null = null
    let impressionsStatus: DeliveryStatus | null = null
    for (const row of subset) {
      const spendCard = row.block.progressCards[0]
      const deliverableCard = row.block.progressCards[deliverableIdx]
      spend += parseCardValue(spendCard?.value)
      impressions += parseCardValue(deliverableCard?.value)
      const status = spendHidden(acc) ? deliverableCard?.status : spendCard?.status
      if (status && status !== "no-data") deliveryStatus = status
      if (deliverableCard?.status && deliverableCard.status !== "no-data") {
        impressionsStatus = deliverableCard.status
      }
    }
    return { spend, impressions, deliveryStatus, impressionsStatus }
  }
  const spendCard = section.aggregate.progressCards[0]
  const deliverableCard = section.aggregate.progressCards[deliverableIdx]
  const deliveryStatus = spendHidden(acc)
    ? (deliverableCard?.status ?? null)
    : (spendCard?.status ?? deliverableCard?.status ?? null)
  const impressionsStatus = deliverableCard?.status ?? null
  return {
    spend: parseCardValue(spendCard?.value),
    impressions: parseCardValue(deliverableCard?.value),
    deliveryStatus: deliveryStatus === "no-data" ? null : deliveryStatus,
    impressionsStatus: impressionsStatus === "no-data" ? null : impressionsStatus,
  }
}

function spendHidden(acc: Acc): boolean {
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

export function visibleCoverageCards(entries: ChannelCoverageEntry[]): ChannelCoverageEntry[] {
  return entries.filter((entry) => entry.status !== "no_source")
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

export function channelCoverage(input: ChannelCoverageInput): ChannelCoverageEntry[] {
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

  const entries: ChannelCoverageEntry[] = []
  for (const acc of groups.values()) {
    const section = sectionForFamily(input.sections, acc.family)
    const hasFacts = groupHasFactRows(acc, section)
    const delivered = deliveredFromCards(acc, section)
    const status = resolveStatus(acc, hasFacts, input.todayISO)
    const hideSpend = spendHidden(acc)
    const modelled = acc.mapRow?.derive_spend_from_plan === true
    const plannedFromSection = plannedDeliverablesFromCards(acc, section)
    entries.push({
      key: acc.key,
      label: groupLabel(acc.family, acc.publisherKey),
      colour: coverageColour(acc.channelKey),
      plannedSpend: acc.plannedSpend,
      plannedImpressions: plannedFromSection > 0 ? plannedFromSection : acc.plannedImpressions,
      deliverableLabel: deliverableLabelFromCards(acc, section),
      deliveredSpend: hideSpend ? null : delivered.spend,
      deliveredImpressions: delivered.impressions,
      status,
      spendModelled: modelled,
      startsOn: acc.earliestStart,
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

  return entries
}
