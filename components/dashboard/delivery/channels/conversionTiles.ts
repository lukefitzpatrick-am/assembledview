import { formatMoney, formatMoneyCompact } from "@/lib/format/money"
import {
  conversionPlatformsForSection,
  cpa,
  cvrPct,
  formatRoas,
  headlineCount,
  headlineLabel,
  roas,
  sumConversionDays,
  type ConversionHeadline,
  type ConversionTotals,
  type LineConversions,
} from "@/lib/delivery/conversions/rules"
import { inPacingWindow, type PacingWindow } from "@/lib/pacing/expectedForWindow"
import type { KpiTileProps } from "../shared/KpiTile"
import type { ChannelSectionData } from "./types"

/** What /api/pacing/conversions returns when the client's switch is on. */
export type DeliveryConversions = {
  headline: ConversionHeadline
  showRevenue: boolean
  /** Platforms with at least one chosen event. */
  trackedPlatforms: string[]
  /** Platforms with a chosen event that counts toward revenue. */
  valuePlatforms: string[]
  lines: LineConversions[]
}

/** Spend and clicks per line and day, used for CPA, CVR and ROAS. */
export type LineSpendDay = { date: string; spend: number; clicks: number }

const REPLACED = new Set(["Conversions", "Purchases", "Leads", "CVR", "CPA", "Revenue", "ROAS"])

function whole(n: number): string {
  return Math.round(n).toLocaleString("en-AU")
}

function money2(n: number | null): string | null {
  return n == null ? null : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function spendClicksInWindow(days: readonly LineSpendDay[] | undefined, window: PacingWindow) {
  let spend = 0
  let clicks = 0
  for (const d of days ?? []) {
    if (!inPacingWindow(d.date, window)) continue
    spend += Number.isFinite(d.spend) ? d.spend : 0
    clicks += Number.isFinite(d.clicks) ? d.clicks : 0
  }
  return { spend, clicks }
}

/** Headline, CVR and CPA tiles, then Revenue and ROAS when the client shows revenue. */
export function conversionKpiTiles(input: {
  totals: ConversionTotals
  spend: number
  clicks: number
  headline: ConversionHeadline
  showRevenue: boolean
  tracked: boolean
  valueTracked: boolean
  accentColour?: string
}): { core: KpiTileProps[]; revenue: KpiTileProps[] } {
  const { totals, spend, clicks, headline, tracked, accentColour } = input
  const count = headlineCount(totals, headline)
  const base = { accentColour, emptyHint: "not-tracked" as const }
  const core: KpiTileProps[] = [
    { ...base, label: headlineLabel(headline), value: tracked ? whole(count) : null },
    {
      ...base,
      label: "CVR",
      value: tracked ? (() => {
        const pct = cvrPct(count, clicks)
        return pct == null ? null : `${pct.toFixed(2)}%`
      })() : null,
    },
    { ...base, label: "CPA", value: tracked ? money2(cpa(spend, count)) : null },
  ]
  if (!input.showRevenue) return { core, revenue: [] }
  const valueOn = tracked && input.valueTracked
  return {
    core,
    revenue: [
      { ...base, label: "Revenue", value: valueOn ? formatMoney(totals.revenue) : null },
      { ...base, label: "ROAS", value: valueOn ? formatRoas(roas(totals.revenue, spend)) : null },
    ],
  }
}

/**
 * Swap the section's conversion tiles (Conversions, CVR, CPA) for the
 * client's chosen events and add Revenue and ROAS when asked. Sections with
 * no conversion platform (OOH, direct digital, plan only) are returned as is.
 * The first replaced tile keeps its place; with none, the tiles go at the end.
 */
export function mergeConversionTiles(tiles: readonly KpiTileProps[], add: { core: KpiTileProps[]; revenue: KpiTileProps[] }): KpiTileProps[] {
  const firstIndex = tiles.findIndex((t) => REPLACED.has(t.label))
  const kept = tiles.filter((t) => !REPLACED.has(t.label))
  const at = firstIndex < 0 ? kept.length : tiles.slice(0, firstIndex).filter((t) => !REPLACED.has(t.label)).length
  return [...kept.slice(0, at), ...add.core, ...kept.slice(at), ...add.revenue]
}

export function applyConversionsToSection(
  section: ChannelSectionData,
  conversions: DeliveryConversions | null | undefined,
  opts: { window: PacingWindow; spendByLine: ReadonlyMap<string, readonly LineSpendDay[]> },
): ChannelSectionData {
  if (!conversions) return section
  const platforms = conversionPlatformsForSection(section.key)
  if (platforms.length === 0) return section

  const tracked = platforms.some((p) => conversions.trackedPlatforms.includes(p))
  const valueTracked = platforms.some((p) => conversions.valuePlatforms.includes(p))
  const byLine = new Map(conversions.lines.map((l) => [l.lineItemId.toLowerCase(), l]))
  const inWindow = (date: string) => inPacingWindow(date, opts.window)
  const accentColour = section.mediaTypeColour

  const aggTotals: ConversionTotals = { conversions: 0, purchases: 0, leads: 0, revenue: 0 }
  let aggSpend = 0
  let aggClicks = 0

  const lineItems = section.lineItems.map((item) => {
    const id = item.id.trim().toLowerCase()
    const totals = sumConversionDays(byLine.get(id)?.daily ?? [], inWindow)
    const { spend, clicks } = spendClicksInWindow(opts.spendByLine.get(id), opts.window)
    aggTotals.conversions += totals.conversions
    aggTotals.purchases += totals.purchases
    aggTotals.leads += totals.leads
    aggTotals.revenue += totals.revenue
    aggSpend += spend
    aggClicks += clicks
    const tiles = mergeConversionTiles(
      item.block.kpiBand.tiles,
      conversionKpiTiles({
        totals,
        spend,
        clicks,
        headline: conversions.headline,
        showRevenue: conversions.showRevenue,
        tracked,
        valueTracked,
        accentColour,
      }),
    )
    return { ...item, block: { ...item.block, kpiBand: { ...item.block.kpiBand, tiles } } }
  })

  const aggregateTiles = mergeConversionTiles(
    section.aggregate.kpiBand.tiles,
    conversionKpiTiles({
      totals: aggTotals,
      spend: aggSpend,
      clicks: aggClicks,
      headline: conversions.headline,
      showRevenue: conversions.showRevenue,
      tracked,
      valueTracked,
      accentColour,
    }),
  )

  return {
    ...section,
    aggregate: { ...section.aggregate, kpiBand: { ...section.aggregate.kpiBand, tiles: aggregateTiles } },
    lineItems,
  }
}

/** Spend and clicks per line from the bulk pacing rows and the search payload. */
export function spendByLineFromDelivery(input: {
  rows: ReadonlyArray<{ lineItemId: string | null; dateDay: string; amountSpent: number; clicks: number }>
  searchLines?: ReadonlyArray<{ lineItemId: string; daily?: ReadonlyArray<{ date: string; cost?: number; clicks?: number }> }>
}): Map<string, LineSpendDay[]> {
  const out = new Map<string, LineSpendDay[]>()
  const push = (id: string | null | undefined, day: LineSpendDay) => {
    const key = String(id ?? "").trim().toLowerCase()
    if (!key || !day.date) return
    const list = out.get(key) ?? []
    list.push(day)
    out.set(key, list)
  }
  for (const r of input.rows) {
    push(r.lineItemId, {
      date: String(r.dateDay ?? "").slice(0, 10),
      spend: Number(r.amountSpent ?? 0),
      clicks: Number(r.clicks ?? 0),
    })
  }
  for (const line of input.searchLines ?? []) {
    for (const d of line.daily ?? []) {
      push(line.lineItemId, {
        date: String(d.date ?? "").slice(0, 10),
        spend: Number(d.cost ?? 0),
        clicks: Number(d.clicks ?? 0),
      })
    }
  }
  return out
}

/** Campaign-level conversions for the status strip (CF5). Same window and spend basis as the section tiles. */
export type CampaignConversionSummary = {
  headline: ConversionHeadline
  /** Purchases, Leads or Conversions. */
  label: string
  /** Headline count across every tracked section's lines. */
  count: number
  /** At least one section on the campaign has a chosen event. */
  tracked: boolean
  showRevenue: boolean
  /** At least one section has an event that counts toward revenue. */
  valueTracked: boolean
  revenue: number
  /** Platform spend on lines in sections whose events count toward revenue. */
  roasSpend: number
  roas: number | null
}

/**
 * Roll the section line items to one campaign figure. Lines are counted once
 * even if they appear in two sections. ROAS divides revenue by the spend of
 * the sections that can carry revenue (social, search), the same basis each
 * section's ROAS tile uses, so OOH and TV spend never dilute it.
 */
export function campaignConversionSummary(
  sections: readonly Pick<ChannelSectionData, "key" | "lineItems">[],
  conversions: DeliveryConversions | null | undefined,
  opts: { window: PacingWindow; spendByLine: ReadonlyMap<string, readonly LineSpendDay[]> },
): CampaignConversionSummary | null {
  if (!conversions) return null
  const byLine = new Map(conversions.lines.map((l) => [l.lineItemId.toLowerCase(), l]))
  const inWindow = (date: string) => inPacingWindow(date, opts.window)
  const seen = new Set<string>()
  const totals: ConversionTotals = { conversions: 0, purchases: 0, leads: 0, revenue: 0 }
  let tracked = false
  let valueTracked = false
  let roasSpend = 0

  for (const section of sections) {
    const platforms = conversionPlatformsForSection(section.key)
    if (platforms.length === 0) continue
    const sectionTracked = platforms.some((p) => conversions.trackedPlatforms.includes(p))
    const sectionValue = platforms.some((p) => conversions.valuePlatforms.includes(p))
    if (!sectionTracked) continue
    tracked = true
    if (sectionValue) valueTracked = true
    for (const item of section.lineItems) {
      const id = item.id.trim().toLowerCase()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const t = sumConversionDays(byLine.get(id)?.daily ?? [], inWindow)
      totals.conversions += t.conversions
      totals.purchases += t.purchases
      totals.leads += t.leads
      totals.revenue += t.revenue
      if (sectionValue) roasSpend += spendClicksInWindow(opts.spendByLine.get(id), opts.window).spend
    }
  }

  return {
    headline: conversions.headline,
    label: headlineLabel(conversions.headline),
    count: headlineCount(totals, conversions.headline),
    tracked,
    showRevenue: conversions.showRevenue,
    valueTracked,
    revenue: totals.revenue,
    roasSpend,
    roas: valueTracked ? roas(totals.revenue, roasSpend) : null,
  }
}

/** Stable key so callers only re-render when the summary really changes. */
export function campaignConversionSummaryKey(summary: CampaignConversionSummary | null): string {
  if (!summary) return "off"
  return [
    summary.headline,
    summary.count,
    summary.tracked ? 1 : 0,
    summary.showRevenue ? 1 : 0,
    summary.valueTracked ? 1 : 0,
    summary.revenue.toFixed(2),
    summary.roasSpend.toFixed(2),
  ].join("|")
}

/** Strip cells: headline, then Revenue and ROAS when the client shows revenue. Null when off. */
export function campaignConversionStripCells(
  summary: CampaignConversionSummary | null,
): Array<{ key: string; label: string; value: string }> | null {
  if (!summary) return null
  const cells = [
    { key: "conversions", label: summary.label, value: summary.tracked ? whole(summary.count) : "—" },
  ]
  if (summary.showRevenue) {
    const valueOn = summary.tracked && summary.valueTracked
    cells.push({ key: "revenue", label: "Revenue", value: valueOn ? formatMoneyCompact(summary.revenue) : "—" })
    cells.push({ key: "roas", label: "ROAS", value: valueOn ? formatRoas(summary.roas) : "—" })
  }
  return cells
}
