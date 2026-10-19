import { formatDateShort } from "@/lib/format/date"
import { formatMoney, formatPercent, formatMoneyCompact, roundMoney2 } from "@/lib/format/money"

import type { CreativePerformanceRow } from "./metrics"

/** Best CTR and best completion both need this many impressions. */
export const TOP_CREATIVE_MIN_IMPRESSIONS = 10_000

export const LINE_CREATIVE_PREVIEW_COUNT = 6

export type TopCreativeReason = "Best CTR" | "Most reach" | "Best completion"

export type TopCreativePick = {
  reason: TopCreativeReason
  creative: CreativePerformanceRow
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  cm360: "CM360",
}

export function creativeIdentity(row: Pick<CreativePerformanceRow, "platform" | "creativeKey">): string {
  return `${row.platform}\0${row.creativeKey}`
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

export function isCm360(platform: string): boolean {
  return platform.trim().toLowerCase() === "cm360"
}

const LABEL_SEPARATOR = /\s+[•·]\s+/

/** "Meta · Avid Golfers — …". The plan line label already leads with the platform, so it is not repeated. */
export function creativeSubtitle(row: Pick<CreativePerformanceRow, "platform" | "lineLabel">): string {
  const platform = platformLabel(row.platform)
  const label = row.lineLabel?.trim() ?? ""
  if (!label) return platform
  const parts = label.split(LABEL_SEPARATOR)
  const rest =
    parts.length > 1 && parts[0]!.trim().toLowerCase() === platform.toLowerCase()
      ? parts.slice(1).join(" · ")
      : parts.join(" · ")
  return rest ? `${platform} · ${rest}` : platform
}

export function adSetNoun(platform: string): string {
  const key = platform.trim().toLowerCase()
  if (key === "meta") return "Ad set"
  if (key === "cm360") return "Placement"
  return "Ad group"
}

export type CreativeFact = { label: string; value: string }

function wholeNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return Math.round(value).toLocaleString("en-AU")
}

export function creativeCpc(row: Pick<CreativePerformanceRow, "spend" | "clicks">): number | null {
  if (row.spend == null || !(row.clicks > 0)) return null
  return row.spend / row.clicks
}

/** Figures for the preview panel. Video views and completions only when the platform reports them. */
export function creativeFacts(row: CreativePerformanceRow): CreativeFact[] {
  const cpc = creativeCpc(row)
  const facts: CreativeFact[] = [
    { label: "Spend", value: row.spend == null ? "—" : formatMoney(row.spend) },
    { label: "Impressions", value: wholeNumber(row.impressions) },
    { label: "Clicks", value: wholeNumber(row.clicks) },
    {
      label: "CTR",
      value: row.ctr == null ? "—" : formatPercent(row.ctr * 100, { decimals: 2 }),
    },
    { label: "CPC", value: cpc == null ? "—" : formatMoney(cpc) },
  ]
  if (row.videoViews != null) facts.push({ label: "Video views", value: wholeNumber(row.videoViews) })
  if (row.videoCompletions != null) {
    facts.push({ label: "Video completions", value: wholeNumber(row.videoCompletions) })
  }
  return facts
}

export type AdSetTotals = { id?: string; name: string; spend?: number; impressions?: number; clicks?: number }

export type AdSetCreativeGroup = {
  creatives: CreativePerformanceRow[]
  /** Ad set row minus its creatives, when they do not add up. */
  unattributed: { spend: number; impressions: number; clicks: number } | null
}

function matchKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase()
}

/**
 * Creatives under each ad set row, by spend. Matched on ad set id, else on
 * ad_group_name. A creative belongs to one ad set at most. The difference
 * between the ad set row and its creatives (money via roundMoney2) becomes the
 * unattributed line; within a cent and with equal counts there is none.
 */
export function creativesByAdSet(
  adSets: AdSetTotals[],
  creatives: CreativePerformanceRow[],
): Map<string, AdSetCreativeGroup> {
  const keyOf = (row: AdSetTotals) => matchKey(row.id) || matchKey(row.name)
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const row of adSets) {
    const key = keyOf(row)
    if (!key) continue
    const id = matchKey(row.id)
    if (id && !byId.has(id)) byId.set(id, key)
    const name = matchKey(row.name)
    if (name && !byName.has(name)) byName.set(name, key)
  }

  const grouped = new Map<string, CreativePerformanceRow[]>()
  for (const creative of creatives) {
    const key = byId.get(matchKey(creative.adSetId)) ?? byName.get(matchKey(creative.adSetName))
    if (!key) continue
    const list = grouped.get(key) ?? []
    list.push(creative)
    grouped.set(key, list)
  }

  const out = new Map<string, AdSetCreativeGroup>()
  for (const row of adSets) {
    const key = keyOf(row)
    if (!key || out.has(key)) continue
    const list = (grouped.get(key) ?? []).toSorted(
      (a, b) => (b.spend ?? 0) - (a.spend ?? 0) || byImpressions(a, b),
    )
    if (list.length === 0) {
      out.set(key, { creatives: [], unattributed: null })
      continue
    }
    let spend = 0
    let impressions = 0
    let clicks = 0
    for (const creative of list) {
      spend += creative.spend ?? 0
      impressions += creative.impressions
      clicks += creative.clicks
    }
    const spendGap = roundMoney2((row.spend ?? 0) - spend)
    const impressionGap = Math.round((row.impressions ?? 0) - impressions)
    const clickGap = Math.round((row.clicks ?? 0) - clicks)
    out.set(key, {
      creatives: list,
      unattributed:
        spendGap !== 0 || impressionGap !== 0 || clickGap !== 0
          ? { spend: spendGap, impressions: impressionGap, clicks: clickGap }
          : null,
    })
  }
  return out
}

export function adSetGroupKey(row: AdSetTotals): string {
  return matchKey(row.id) || matchKey(row.name)
}

function byImpressions(a: CreativePerformanceRow, b: CreativePerformanceRow): number {
  if (b.impressions !== a.impressions) return b.impressions - a.impressions
  const platform = a.platform.localeCompare(b.platform)
  if (platform !== 0) return platform
  return a.creativeKey.localeCompare(b.creativeKey)
}

function byRate(
  read: (row: CreativePerformanceRow) => number | null,
): (a: CreativePerformanceRow, b: CreativePerformanceRow) => number {
  return (a, b) => {
    const delta = (read(b) ?? Number.NEGATIVE_INFINITY) - (read(a) ?? Number.NEGATIVE_INFINITY)
    if (delta !== 0) return delta
    return byImpressions(a, b)
  }
}

function isCompletionCandidate(row: CreativePerformanceRow): boolean {
  if (row.vcr == null || row.impressions < TOP_CREATIVE_MIN_IMPRESSIONS) return false
  return row.format.kind !== "image" && row.format.kind !== "carousel"
}

/**
 * Three cards, each for a different reason, no creative twice.
 * A slot with no candidate takes the next-highest impressions ad and is labelled Most reach.
 */
export function selectTopCreatives(rows: CreativePerformanceRow[]): TopCreativePick[] {
  const used = new Set<string>()
  const picks: TopCreativePick[] = []

  function unused(list: CreativePerformanceRow[]): CreativePerformanceRow | null {
    return list.find((row) => !used.has(creativeIdentity(row))) ?? null
  }

  function take(preferred: CreativePerformanceRow | null, reason: TopCreativeReason) {
    const row = preferred ?? unused([...rows].toSorted(byImpressions))
    if (!row) return
    used.add(creativeIdentity(row))
    picks.push({ reason: preferred ? reason : "Most reach", creative: row })
  }

  const bestCtr = unused(
    rows
      .filter((row) => row.impressions >= TOP_CREATIVE_MIN_IMPRESSIONS && row.ctr != null)
      .toSorted(byRate((row) => row.ctr)),
  )
  take(bestCtr, "Best CTR")

  take(unused([...rows].toSorted(byImpressions)), "Most reach")

  const bestCompletion = unused(
    rows.filter(isCompletionCandidate).toSorted(byRate((row) => row.vcr)),
  )
  take(bestCompletion, "Best completion")

  return picks
}

export function creativesForLine(
  rows: CreativePerformanceRow[],
  lineItemId: string,
): CreativePerformanceRow[] {
  const key = lineItemId.trim().toLowerCase()
  if (!key) return []
  return rows
    .filter((row) => (row.lineItemId ?? "").trim().toLowerCase() === key)
    .toSorted((a, b) => {
      const delta = (b.ctr ?? -1) - (a.ctr ?? -1)
      if (delta !== 0) return delta
      return byImpressions(a, b)
    })
}

export function lineCreativeSlice(
  rows: CreativePerformanceRow[],
  expanded: boolean,
): CreativePerformanceRow[] {
  if (expanded || rows.length <= LINE_CREATIVE_PREVIEW_COUNT) return rows
  return rows.slice(0, LINE_CREATIVE_PREVIEW_COUNT)
}

export function showAllCreativeLabel(count: number, expanded: boolean): string | null {
  if (expanded || count <= LINE_CREATIVE_PREVIEW_COUNT) return null
  return `Show all ${count}`
}

export function formatCreativeImpressions(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return `${Math.round(value).toLocaleString("en-AU")} impressions`
}

function rateText(ratio: number | null, decimals: 0 | 1 | 2, suffix: string): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—"
  return `${formatPercent(ratio * 100, { decimals })} ${suffix}`
}

export function formatCreativeCtr(ratio: number | null): string {
  return rateText(ratio, 2, "CTR")
}

export function formatCreativeVcr(ratio: number | null): string {
  return rateText(ratio, 0, "completion")
}

export function formatCreativeViewable(ratio: number | null): string {
  return rateText(ratio, 0, "viewable")
}

/** The figure on the right of a line row. Video uses completion. Social and display use CTR. */
export function lineRankingMetric(row: CreativePerformanceRow): string {
  if (row.format.kind === "video") return formatCreativeVcr(row.vcr)
  return formatCreativeCtr(row.ctr)
}

export function lineCreativeSubline(row: CreativePerformanceRow): string {
  if (isCm360(row.platform)) {
    return `${formatCreativeImpressions(row.impressions)} · ${formatCreativeViewable(row.viewableRate)}`
  }
  return `${formatMoneyCompact(row.spend)} · ${formatCreativeImpressions(row.impressions)}`
}

export function topCreativeMetricLine(pick: TopCreativePick): {
  headline: string
  supports: [string, string]
} {
  const row = pick.creative
  const impressions = formatCreativeImpressions(row.impressions)
  const ctr = formatCreativeCtr(row.ctr)
  const secondary = isCm360(row.platform)
    ? formatCreativeViewable(row.viewableRate)
    : formatMoneyCompact(row.spend)

  if (pick.reason === "Best completion") {
    return { headline: formatCreativeVcr(row.vcr), supports: [impressions, ctr] }
  }
  if (pick.reason === "Most reach") {
    return { headline: impressions, supports: [ctr, secondary] }
  }
  return { headline: ctr, supports: [impressions, secondary] }
}

/** Date window of the returned rows, one span per platform. */
export function platformWindowNote(rows: CreativePerformanceRow[]): string {
  const windows = new Map<string, { first: string; last: string }>()
  for (const row of rows) {
    if (!row.firstDate || !row.lastDate) continue
    const current = windows.get(row.platform)
    if (!current) {
      windows.set(row.platform, { first: row.firstDate, last: row.lastDate })
      continue
    }
    if (row.firstDate < current.first) current.first = row.firstDate
    if (row.lastDate > current.last) current.last = row.lastDate
  }
  return [...windows.entries()]
    .map(([platform, window]) => {
      const start = formatDateShort(window.first)
      const end = formatDateShort(window.last)
      const span = start === end ? start : `${start} to ${end}`
      return `${platformLabel(platform)} ${span}`
    })
    .join(" · ")
}
