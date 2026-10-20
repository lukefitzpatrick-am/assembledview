/**
 * Conversions rolled to delivery-snapshot channel groups (CF5).
 * Pure. Shared by the report deck and Ava's get_delivery_snapshot.
 *
 * Same rules as the delivery tiles and the status strip:
 * - Only sections with a conversion platform count (OOH, direct digital and
 *   assumed spend never do).
 * - ROAS divides revenue by spend on channels that can carry revenue, so
 *   OOH, DV360 and TV spend never dilute it. Null at zero spend.
 * - No currency conversion; no targets.
 */
import {
  conversionPlatformsForSection,
  cpa,
  headlineCount,
  headlineLabel,
  roas,
  sumConversionDays,
  type ConversionHeadline,
  type ConversionTotals,
  type LineConversions,
} from "@/lib/delivery/conversions/rules"

/** What the loader hands back when the client's switch is on. */
export type LoadedConversions = {
  headline: ConversionHeadline
  showRevenue: boolean
  trackedPlatforms: string[]
  valuePlatforms: string[]
  /** Last day counted: the window end, capped at Melbourne yesterday. */
  throughDate: string
  /** Already limited to the window by the read. */
  lines: LineConversions[]
}

export type ConversionFigures = {
  /** Purchases, Leads or Conversions. */
  label: string
  /** Headline count. Null when the channel has no chosen event. */
  count: number | null
  conversions: number
  purchases: number
  leads: number
  /** Null unless show revenue is on and an event counts toward revenue. */
  revenue: number | null
  /** Spend used for CPA and ROAS. */
  spend: number
  cpa: number | null
  roas: number | null
  tracked: boolean
  valueTracked: boolean
}

export type ChannelConversionInput = {
  group: string
  lines: ReadonlyArray<{ lineItemId: string; spendToDate: number }>
}

export type ConversionsByChannel = {
  headline: ConversionHeadline
  label: string
  showRevenue: boolean
  throughDate: string
  total: ConversionFigures
  byChannel: Map<string, ConversionFigures>
  byLine: Map<string, ConversionFigures & { group: string }>
}

/** Snapshot groups use underscores (social_meta); delivery sections use hyphens (social-meta). */
export function conversionPlatformsForGroup(group: string): string[] {
  return conversionPlatformsForSection(String(group ?? "").trim().toLowerCase().replace(/_/g, "-"))
}

function emptyTotals(): ConversionTotals {
  return { conversions: 0, purchases: 0, leads: 0, revenue: 0 }
}

function add(into: ConversionTotals, t: ConversionTotals): void {
  into.conversions += t.conversions
  into.purchases += t.purchases
  into.leads += t.leads
  into.revenue += t.revenue
}

function finite(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function figures(
  loaded: LoadedConversions,
  totals: ConversionTotals,
  spend: number,
  roasSpend: number,
  tracked: boolean,
  valueTracked: boolean,
): ConversionFigures {
  const count = headlineCount(totals, loaded.headline)
  const valueOn = loaded.showRevenue && tracked && valueTracked
  return {
    label: headlineLabel(loaded.headline),
    count: tracked ? count : null,
    conversions: totals.conversions,
    purchases: totals.purchases,
    leads: totals.leads,
    revenue: valueOn ? totals.revenue : null,
    spend,
    cpa: tracked ? cpa(spend, count) : null,
    roas: valueOn ? roas(totals.revenue, roasSpend) : null,
    tracked,
    valueTracked,
  }
}

/** Null when the switch is off (loaded is null). */
export function conversionsByChannel(
  channels: readonly ChannelConversionInput[],
  loaded: LoadedConversions | null | undefined,
): ConversionsByChannel | null {
  if (!loaded) return null
  const byLineDays = new Map(loaded.lines.map((l) => [l.lineItemId.trim().toLowerCase(), l.daily]))
  const byChannel = new Map<string, ConversionFigures>()
  const byLine = new Map<string, ConversionFigures & { group: string }>()
  const seen = new Set<string>()
  const campaign = emptyTotals()
  let campaignSpend = 0
  let campaignRoasSpend = 0
  let anyTracked = false
  let anyValue = false

  for (const ch of channels) {
    const platforms = conversionPlatformsForGroup(ch.group)
    if (platforms.length === 0) continue
    const tracked = platforms.some((p) => loaded.trackedPlatforms.includes(p))
    const valueTracked = platforms.some((p) => loaded.valuePlatforms.includes(p))
    const chTotals = emptyTotals()
    let chSpend = 0
    for (const line of ch.lines) {
      const id = String(line.lineItemId ?? "").trim().toLowerCase()
      if (!id) continue
      const t = tracked ? sumConversionDays(byLineDays.get(id) ?? []) : emptyTotals()
      const spend = finite(line.spendToDate)
      add(chTotals, t)
      chSpend += spend
      byLine.set(id, { group: ch.group, ...figures(loaded, t, spend, spend, tracked, valueTracked) })
      if (!tracked || seen.has(id)) continue
      seen.add(id)
      add(campaign, t)
      campaignSpend += spend
      if (valueTracked) campaignRoasSpend += spend
    }
    if (tracked) anyTracked = true
    if (tracked && valueTracked) anyValue = true
    byChannel.set(ch.group, figures(loaded, chTotals, chSpend, chSpend, tracked, valueTracked))
  }

  return {
    headline: loaded.headline,
    label: headlineLabel(loaded.headline),
    showRevenue: loaded.showRevenue,
    throughDate: loaded.throughDate,
    total: figures(loaded, campaign, campaignSpend, campaignRoasSpend, anyTracked, anyValue),
    byChannel,
    byLine,
  }
}
