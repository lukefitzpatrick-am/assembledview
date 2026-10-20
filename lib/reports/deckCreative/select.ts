/**
 * Pure selection of the creatives a report deck shows. No I/O.
 * Campaign: the top 3 creatives. Lines: up to 8 lines, top 3 creatives each.
 * Ranked by spend, then impressions (CM360 has no spend).
 */
import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import { platformLabel } from "@/lib/creative/performance/present"

export const DECK_CREATIVES_PER_SLIDE = 3
export const DECK_CREATIVE_LINES_MAX = 8

export type DeckCreativeRow = {
  creativeKey: string
  platformKey: string
  name: string
  platform: string
  adSet: string | null
  kind: "image" | "video" | null
  /** File name of the uploaded thumbnail in the skill container, or null. */
  imageFile: string | null
  /** "View ad" link: the Meta shareable link, or the CM360 video file. */
  viewUrl: string | null
  spend: number | null
  impressions: number
  clicks: number
  ctr: number | null
  conversions: number | null
}

export type DeckCreatives = {
  campaign: DeckCreativeRow[]
  lines: { lineItemId: string; label: string; rows: DeckCreativeRow[] }[]
}

function rankValue(row: CreativePerformanceRow): [number, number] {
  return [row.spend ?? -1, row.impressions]
}

export function byDeckRank(a: CreativePerformanceRow, b: CreativePerformanceRow): number {
  const [as, ai] = rankValue(a)
  const [bs, bi] = rankValue(b)
  if (as !== bs) return bs - as
  if (ai !== bi) return bi - ai
  return a.creativeKey.localeCompare(b.creativeKey)
}

function toDeckRow(row: CreativePerformanceRow): DeckCreativeRow {
  return {
    creativeKey: row.creativeKey,
    platformKey: row.platform,
    name: row.name?.trim() || "Untitled ad",
    platform: platformLabel(row.platform),
    adSet: row.adSetName?.trim() || null,
    kind: row.previewKind,
    imageFile: null,
    viewUrl: row.viewUrl ?? row.videoUrl ?? null,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    conversions: row.conversions,
  }
}

export function selectDeckCreatives(rows: CreativePerformanceRow[]): DeckCreatives {
  const live = rows.filter((row) => row.impressions > 0)
  const campaign = [...live].sort(byDeckRank).slice(0, DECK_CREATIVES_PER_SLIDE).map(toDeckRow)

  const byLine = new Map<string, { label: string; rows: CreativePerformanceRow[]; spend: number; impressions: number }>()
  for (const row of live) {
    const id = row.lineItemId?.trim().toLowerCase()
    if (!id) continue
    const entry = byLine.get(id) ?? { label: row.lineLabel?.trim() || id.toUpperCase(), rows: [], spend: 0, impressions: 0 }
    entry.rows.push(row)
    entry.spend += row.spend ?? 0
    entry.impressions += row.impressions
    byLine.set(id, entry)
  }
  const lines = [...byLine.entries()]
    .sort(([, a], [, b]) => (b.spend !== a.spend ? b.spend - a.spend : b.impressions - a.impressions))
    .slice(0, DECK_CREATIVE_LINES_MAX)
    .map(([lineItemId, entry]) => ({
      lineItemId,
      label: entry.label,
      rows: [...entry.rows].sort(byDeckRank).slice(0, DECK_CREATIVES_PER_SLIDE).map(toDeckRow),
    }))

  return { campaign, lines }
}

/** Unique creatives across the campaign and line slides, in first-seen order. */
export function uniqueDeckCreatives(creatives: DeckCreatives): DeckCreativeRow[] {
  const seen = new Map<string, DeckCreativeRow>()
  for (const row of [...creatives.campaign, ...creatives.lines.flatMap((line) => line.rows)]) {
    const key = `${row.platformKey}|${row.creativeKey}`
    if (!seen.has(key)) seen.set(key, row)
  }
  return [...seen.values()]
}

/** Sets imageFile on every row whose creative got an uploaded image. */
export function withImageFiles(creatives: DeckCreatives, files: ReadonlyMap<string, string>): DeckCreatives {
  const apply = (row: DeckCreativeRow): DeckCreativeRow => ({
    ...row,
    imageFile: files.get(`${row.platformKey}|${row.creativeKey}`) ?? null,
  })
  return {
    campaign: creatives.campaign.map(apply),
    lines: creatives.lines.map((line) => ({ ...line, rows: line.rows.map(apply) })),
  }
}
