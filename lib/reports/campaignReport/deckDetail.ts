/**
 * Line-item and ad-group rows for an on-demand deck.
 * Pure. The monthly cron never calls this: a missing level stays channel.
 */
import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import { cleanPacingLineItemId } from "@/lib/pacing/delivery/lineItemIds"
import { campaignReportChannelLabel } from "@/lib/reports/campaignReport/reportFigures"

export const DECK_DETAIL_LEVELS = ["channel", "line_item", "ad_group"] as const

export type DeckDetailLevel = (typeof DECK_DETAIL_LEVELS)[number]

export type DeckDetailRow = {
  name: string
  /** Null for CM360 placements. Spend is reported on the line. */
  spend: number | null
  impressions: number
  clicks: number
  /** Null when this channel's rows have no results. */
  results: number | null
  /** Clicks / impressions. Null when impressions are 0. */
  ctr: number | null
}

export type DeckDetail = {
  group: string
  label: string
  level: "line_item" | "ad_group"
  rankBy: "spend" | "impressions"
  rows: DeckDetailRow[]
  /** Row count before the top-6 cut. */
  total: number
  note: string | null
}

export type DeckDetailWindow = {
  startISO: string
  endISO: string
}

type DetailPacingRow = {
  dateDay?: string | null
  entityName?: string | null
  adsetName?: string | null
  lineItemId?: string | null
  amountSpent?: number | null
  impressions?: number | null
  clicks?: number | null
  results?: number | null
}

type DetailSearchAdGroup = {
  lineItemId?: string | null
  name?: string | null
  totals?: {
    cost?: number | null
    clicks?: number | null
    conversions?: number | null
    impressions?: number | null
  } | null
}

export type DeckDetailSnapshot = {
  channels: DeliveryChannelGroup[]
  dailyPacingRows?: DetailPacingRow[] | null
  dailySearch?: { adGroups?: DetailSearchAdGroup[] | null } | null
}

type RawMetric = {
  name: string
  lineId: string
  spend: number
  impressions: number
  clicks: number
  results: number
}

const SOCIAL_GROUPS = new Set(["social_meta", "social_tiktok", "social_reddit"])
const PROGRAMMATIC_GROUPS = new Set([
  "programmatic_display",
  "programmatic_video",
  "programmatic_ooh",
])
const CM360_GROUPS = new Set(["digital_display", "digital_video", "digital_audio", "bvod"])
const TOP_ROWS = 6
const NAME_LIMIT = 60
const ESTIMATED_NOTE = "Estimated spend on CM360 lines."
const CM360_NOTE = "Placements ranked by impressions. Spend is reported at line level."

export function readDeckDetailLevel(
  value: unknown,
): { detailLevel: DeckDetailLevel } | { error: string } {
  if (value == null) return { detailLevel: "channel" }
  const text = String(value).trim()
  if (!text) return { detailLevel: "channel" }
  if (DECK_DETAIL_LEVELS.includes(text as DeckDetailLevel)) {
    return { detailLevel: text as DeckDetailLevel }
  }
  return { error: "detailLevel must be channel, line_item, or ad_group" }
}

export function buildDeckDetail(
  snapshot: DeckDetailSnapshot,
  level: "line_item" | "ad_group",
  window: DeckDetailWindow,
): DeckDetail[] {
  const details: DeckDetail[] = []
  for (const channel of snapshot.channels) {
    if (!isLiveChannel(channel)) continue
    const detail =
      level === "line_item"
        ? lineItemDetail(channel)
        : adGroupDetail(channel, snapshot, window)
    if (detail && detail.rows.length > 0) details.push(detail)
  }
  return details
}

function isLiveChannel(channel: DeliveryChannelGroup): boolean {
  if (channel.group === "assumed_spend" || channel.group === "plan_only") return false
  return channel.totals.spendToDate > 0
}

function lineHasDelivery(line: DeliveryLineSnapshot): boolean {
  return line.spendToDate > 0 || line.impressions > 0 || line.clicks > 0 || line.results > 0
}

function lineItemDetail(channel: DeliveryChannelGroup): DeckDetail | null {
  const lines = channel.lines.filter(lineHasDelivery)
  const raw: RawMetric[] = lines.map((line) => ({
    name: line.label?.trim() || line.name,
    lineId: line.lineItemId,
    spend: line.spendToDate,
    impressions: line.impressions,
    clicks: line.clicks,
    results: line.results,
  }))
  const estimated = lines.some((line) => line.spendMode === "estimated")
  return finish(channel, "line_item", "spend", raw, estimated ? ESTIMATED_NOTE : null, false)
}

function adGroupDetail(
  channel: DeliveryChannelGroup,
  snapshot: DeckDetailSnapshot,
  window: DeckDetailWindow,
): DeckDetail | null {
  if (channel.group === "search") {
    return finish(channel, "ad_group", "spend", searchRows(channel, snapshot), null, true)
  }
  if (CM360_GROUPS.has(channel.group)) {
    return finish(
      channel,
      "ad_group",
      "impressions",
      pacingRows(channel, snapshot, window),
      CM360_NOTE,
      true,
      true,
    )
  }
  if (SOCIAL_GROUPS.has(channel.group) || PROGRAMMATIC_GROUPS.has(channel.group)) {
    return finish(channel, "ad_group", "spend", pacingRows(channel, snapshot, window), null, true)
  }
  return null
}

function lineIdMap(channel: DeliveryChannelGroup): Map<string, string> {
  const ids = new Map<string, string>()
  for (const line of channel.lines) {
    const cleaned = cleanPacingLineItemId(line.lineItemId)
    if (cleaned) ids.set(cleaned, line.lineItemId)
  }
  return ids
}

function inWindow(dateDay: string | null | undefined, window: DeckDetailWindow): boolean {
  const day = String(dateDay ?? "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  return day >= window.startISO && day <= window.endISO
}

function pacingRows(
  channel: DeliveryChannelGroup,
  snapshot: DeckDetailSnapshot,
  window: DeckDetailWindow,
): RawMetric[] {
  const ids = lineIdMap(channel)
  const rows: RawMetric[] = []
  for (const row of snapshot.dailyPacingRows ?? []) {
    if (!inWindow(row.dateDay, window)) continue
    const cleaned = cleanPacingLineItemId(row.lineItemId)
    if (!cleaned || !ids.has(cleaned)) continue
    const name = String(row.entityName ?? row.adsetName ?? "").trim()
    if (!name) continue
    rows.push({
      name,
      lineId: ids.get(cleaned) ?? cleaned,
      spend: numberOrZero(row.amountSpent),
      impressions: numberOrZero(row.impressions),
      clicks: numberOrZero(row.clicks),
      results: numberOrZero(row.results),
    })
  }
  return rows
}

function searchRows(channel: DeliveryChannelGroup, snapshot: DeckDetailSnapshot): RawMetric[] {
  const ids = lineIdMap(channel)
  const rows: RawMetric[] = []
  for (const row of snapshot.dailySearch?.adGroups ?? []) {
    const cleaned = cleanPacingLineItemId(row.lineItemId)
    if (!cleaned || !ids.has(cleaned)) continue
    const name = String(row.name ?? "").trim()
    if (!name) continue
    rows.push({
      name,
      lineId: ids.get(cleaned) ?? cleaned,
      spend: numberOrZero(row.totals?.cost),
      impressions: numberOrZero(row.totals?.impressions),
      clicks: numberOrZero(row.totals?.clicks),
      results: numberOrZero(row.totals?.conversions),
    })
  }
  return rows
}

function finish(
  channel: DeliveryChannelGroup,
  level: "line_item" | "ad_group",
  rankBy: "spend" | "impressions",
  raw: RawMetric[],
  baseNote: string | null,
  cleanNames: boolean,
  omitSpend = false,
): DeckDetail | null {
  const prepared = cleanNames ? cleanAndMerge(raw, rankBy) : raw.map((row) => ({ ...row }))
  const alive = prepared
    .map((row) => ({ ...row, spend: roundSpend(row.spend) }))
    .filter((row) => !isAllZero(row, omitSpend))
  if (alive.length === 0) return null
  const ranked = disambiguate(
    alive.sort((a, b) => {
      const diff = rankValue(b, rankBy) - rankValue(a, rankBy)
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name)
    }),
  )
  const total = ranked.length
  const cut = ranked.slice(0, TOP_ROWS)
  const channelHasResults = ranked.some((row) => row.results > 0)
  const topNote = total > TOP_ROWS ? `Top ${TOP_ROWS} of ${total} by ${rankBy === "impressions" ? "impressions" : "spend"}.` : null
  const note = joinNote(baseNote, topNote)
  return {
    group: channel.group,
    label: campaignReportChannelLabel(channel.group),
    level,
    rankBy,
    total,
    note,
    rows: cut.map((row) => ({
      name: row.name,
      spend: omitSpend ? null : row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      results: channelHasResults ? row.results : null,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
    })),
  }
}

function cleanAndMerge(raw: RawMetric[], rankBy: "spend" | "impressions"): RawMetric[] {
  const stripped = raw.map((row) => ({
    ...row,
    name: stripLineSuffix(row.name, row.lineId),
  }))
  const prefixed = stripCommonPrefix(stripped)
  const merged = new Map<string, RawMetric & { rank: number }>()
  for (const row of prefixed) {
    const key = `${row.name.toLowerCase()}\n${cleanPacingLineItemId(row.lineId)}`
    const rank = rankValue(row, rankBy)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...row, rank })
      continue
    }
    if (rank > existing.rank) existing.name = row.name
    existing.spend += row.spend
    existing.impressions += row.impressions
    existing.clicks += row.clicks
    existing.results += row.results
    existing.rank = Math.max(existing.rank, rank)
  }
  return [...merged.values()].map(({ rank: _rank, ...row }) => row)
}

const PLAN_CODE = /[-_ ]?[a-z]{3,10}\d{3}[a-z]{2}\d+$/i

function stripLineSuffix(name: string, lineId: string): string {
  const trimmed = name.trim()
  const id = lineId.trim()
  const withoutOwnId = id
    ? trimmed.replace(new RegExp(`[-_]${escapeRegExp(id)}$`, "i"), "").trim()
    : trimmed
  const base = withoutOwnId.length > 0 ? withoutOwnId : trimmed
  const withoutPlanCode = base.replace(PLAN_CODE, "").trim()
  return withoutPlanCode.length > 0 ? withoutPlanCode : base
}

function disambiguate(rows: RawMetric[]): RawMetric[] {
  const named = rows.map((row) => ({ ...row, name: truncateName(row.name) }))
  const counts = new Map<string, number>()
  for (const row of named) {
    const key = row.name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return named.map((row) => {
    if ((counts.get(row.name.toLowerCase()) ?? 0) < 2) return row
    return { ...row, name: `${row.name} (${shortCode(row.lineId)})` }
  })
}

function shortCode(lineId: string): string {
  const match = lineId.trim().match(/([a-z]{2}\d+)$/i)
  return (match?.[1] ?? lineId.trim()).toUpperCase()
}

function isAllZero(row: RawMetric, omitSpend: boolean): boolean {
  const spend = omitSpend ? 0 : (row.spend ?? 0)
  return spend === 0 && row.impressions === 0 && row.clicks === 0 && row.results === 0
}

function stripCommonPrefix(rows: RawMetric[]): RawMetric[] {
  if (rows.length < 2) return rows
  const prefix = commonPrefixEndingOnSeparator(rows.map((row) => row.name))
  if (!prefix) return rows
  const remainders = rows.map((row) => row.name.startsWith(prefix) ? row.name.slice(prefix.length).trim() : row.name)
  if (remainders.some((name) => name.length < 3)) return rows
  return rows.map((row, index) => ({ ...row, name: remainders[index] ?? row.name }))
}

function commonPrefixEndingOnSeparator(names: string[]): string {
  if (names.length < 2) return ""
  let prefix = names[0] ?? ""
  for (const name of names.slice(1)) {
    let index = 0
    const limit = Math.min(prefix.length, name.length)
    while (index < limit && prefix[index] === name[index]) index += 1
    prefix = prefix.slice(0, index)
    if (!prefix) return ""
  }
  const end = Math.max(prefix.lastIndexOf("-"), prefix.lastIndexOf("_"))
  if (end < 0) return ""
  return prefix.slice(0, end + 1)
}

function truncateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= NAME_LIMIT) return trimmed
  return `${trimmed.slice(0, NAME_LIMIT - 1)}…`
}

function joinNote(base: string | null, extra: string | null): string | null {
  const parts = [base, extra].filter((part): part is string => Boolean(part && part.trim()))
  return parts.length > 0 ? parts.join(" ") : null
}

function rankValue(row: { spend: number; impressions: number }, rankBy: "spend" | "impressions"): number {
  return rankBy === "impressions" ? row.impressions : row.spend
}

function roundSpend(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function numberOrZero(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
