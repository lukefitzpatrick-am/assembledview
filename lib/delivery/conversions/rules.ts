/**
 * Conversions per client (plan PLAN-AV-conversions-roas-2026-10-21, decisions 21 Oct 2026).
 * Pure rules shared by the settings API, the read route and the delivery tiles.
 *
 * - One switch per client. Off: nothing is read or shown.
 * - One headline per client: purchases, leads or conversions.
 * - Revenue comes only from chosen events with include_value on a purchase
 *   category event. Values are never summed across equivalent events.
 * - Never count Meta omni_purchase (and the other purchase aliases) with purchase.
 * - CM360 floodlights win over DV360 on a line that has both.
 */

import { cvr } from "@/lib/money/rates"

export const CONVERSION_PLATFORMS = [
  "meta_ads",
  "google_ads",
  "microsoft_ads",
  "tiktok",
  "dv360",
  "cm360",
  "taboola",
  "reddit",
] as const
export type ConversionPlatform = (typeof CONVERSION_PLATFORMS)[number]

export const CONVERSION_HEADLINES = ["purchases", "leads", "conversions"] as const
export type ConversionHeadline = (typeof CONVERSION_HEADLINES)[number]

export const CONVERSION_CATEGORIES = ["purchase", "lead", "other"] as const
export type ConversionCategory = (typeof CONVERSION_CATEGORIES)[number]

export type ConversionSettings = {
  enabled: boolean
  headline: ConversionHeadline
  showRevenue: boolean
}

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  enabled: false,
  headline: "conversions",
  showRevenue: false,
}

export type ConversionEventChoice = {
  platform: ConversionPlatform
  eventKey: string
  label: string | null
  category: ConversionCategory
  includeValue: boolean
}

/** Google's "all primary conversions" stopgap event (one per line). */
export const GOOGLE_ALL_PRIMARY = "all_primary"

/**
 * Keys that report the same number. At most one key per group may be chosen.
 * Meta: purchase aliases and lead aliases (plan section 2). TikTok: both
 * purchase columns. Only `purchase` and `lead` are loaded into the fact for
 * Meta, but the guard also covers aliases in case they are added later.
 */
const EQUIVALENT_GROUPS: Partial<Record<ConversionPlatform, string[][]>> = {
  meta_ads: [
    ["purchase", "omni_purchase", "onsite_web_purchase", "offsite_conversion.fb_pixel_purchase", "web_in_store_purchase"],
    ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  ],
  tiktok: [["complete_payment", "total_purchase"]],
}

/** Event keys whose value may count toward revenue, per platform. Null = any purchase-category key. */
const VALUE_KEYS: Partial<Record<ConversionPlatform, string[] | null>> = {
  meta_ads: ["purchase"],
  tiktok: ["complete_payment", "total_purchase"],
  google_ads: null,
  microsoft_ads: null,
  cm360: ["total_conversions"],
  dv360: [],
  taboola: ["cpa_actions"],
  reddit: ["purchase"],
}

export function isConversionPlatform(value: unknown): value is ConversionPlatform {
  return typeof value === "string" && (CONVERSION_PLATFORMS as readonly string[]).includes(value)
}

export function isConversionHeadline(value: unknown): value is ConversionHeadline {
  return typeof value === "string" && (CONVERSION_HEADLINES as readonly string[]).includes(value)
}

export function isConversionCategory(value: unknown): value is ConversionCategory {
  return typeof value === "string" && (CONVERSION_CATEGORIES as readonly string[]).includes(value)
}

export function normaliseEventKey(platform: ConversionPlatform, key: string): string {
  const trimmed = String(key ?? "").trim()
  // Google conversion action resource names keep their case; everything else is lower case in the fact.
  return platform === "google_ads" && trimmed !== GOOGLE_ALL_PRIMARY ? trimmed : trimmed.toLowerCase()
}

/** True when this event's value may count toward revenue. */
export function valueAllowed(choice: Pick<ConversionEventChoice, "platform" | "eventKey" | "category">): boolean {
  if (choice.category !== "purchase") return false
  const allowed = VALUE_KEYS[choice.platform]
  if (allowed === undefined) return false
  if (allowed === null) return true
  return allowed.includes(choice.eventKey)
}

/**
 * Problems with a set of chosen events. Empty list = valid.
 * Messages are short and shown in the client settings form.
 */
export function conversionEventProblems(choices: readonly ConversionEventChoice[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const c of choices) {
    const id = `${c.platform}|${c.eventKey}`
    if (seen.has(id)) problems.push(`${c.eventKey} is chosen twice on ${c.platform}.`)
    seen.add(id)
    if (c.includeValue && !valueAllowed(c)) {
      problems.push(
        c.category !== "purchase"
          ? `${c.label || c.eventKey}: only purchase events can count toward revenue.`
          : `${c.label || c.eventKey}: this event has no usable value on ${c.platform}.`,
      )
    }
  }
  for (const platform of CONVERSION_PLATFORMS) {
    const keys = choices.filter((c) => c.platform === platform).map((c) => c.eventKey)
    for (const group of EQUIVALENT_GROUPS[platform] ?? []) {
      const hits = keys.filter((k) => group.includes(k))
      if (hits.length > 1) {
        problems.push(`${hits.join(" and ")} report the same number on ${platform}. Choose one.`)
      }
    }
    if (platform === "google_ads" && keys.includes(GOOGLE_ALL_PRIMARY) && keys.some((k) => k !== GOOGLE_ALL_PRIMARY)) {
      problems.push("All primary conversions already includes each Google action. Choose it or single actions, not both.")
    }
    const valued = choices.filter((c) => c.platform === platform && c.includeValue)
    if (valued.length > 1 && platform !== "google_ads") {
      problems.push(`Only one ${platform} event can count toward revenue.`)
    }
  }
  return problems
}

/** Platforms whose conversions feed a delivery section. OOH and direct digital are not included. */
export function conversionPlatformsForSection(sectionKey: string): ConversionPlatform[] {
  switch (sectionKey) {
    case "social-meta":
      return ["meta_ads"]
    case "social-tiktok":
      return ["tiktok"]
    case "social-reddit":
      return ["reddit"]
    case "search":
      return ["google_ads", "microsoft_ads"]
    case "programmatic-display":
      return ["dv360", "cm360", "taboola"]
    case "programmatic-video":
      return ["dv360", "cm360"]
    default:
      return []
  }
}

export function headlineLabel(headline: ConversionHeadline): string {
  return headline === "purchases" ? "Purchases" : headline === "leads" ? "Leads" : "Conversions"
}

/** One fact row from MART.VW_CONVERSION_DAILY, already lower-cased where needed. */
export type ConversionFactRow = {
  lineItemId: string
  date: string
  platform: string
  eventKey: string
  conversions: number
  conversionValue: number | null
}

export type ConversionDay = {
  date: string
  /** All chosen events. */
  conversions: number
  purchases: number
  leads: number
  /** Value from include_value events only. */
  revenue: number
}

export type LineConversions = {
  lineItemId: string
  daily: ConversionDay[]
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Keep chosen events only and roll them to line and day.
 * A line with any CM360 rows drops its DV360 rows (decision 8).
 */
export function rollupConversions(
  rows: readonly ConversionFactRow[],
  choices: readonly ConversionEventChoice[],
): LineConversions[] {
  const chosen = new Map<string, ConversionEventChoice>()
  for (const c of choices) chosen.set(`${c.platform}|${c.eventKey}`, c)

  const cm360Lines = new Set<string>()
  for (const row of rows) {
    if (row.platform === "cm360" && chosen.has(`cm360|${row.eventKey}`)) cm360Lines.add(row.lineItemId)
  }

  const byLine = new Map<string, Map<string, ConversionDay>>()
  for (const row of rows) {
    const choice = chosen.get(`${row.platform}|${row.eventKey}`)
    if (!choice) continue
    const lineId = String(row.lineItemId ?? "").trim().toLowerCase()
    if (!lineId || !row.date) continue
    if (row.platform === "dv360" && cm360Lines.has(lineId)) continue
    const days = byLine.get(lineId) ?? new Map<string, ConversionDay>()
    const day = days.get(row.date) ?? { date: row.date, conversions: 0, purchases: 0, leads: 0, revenue: 0 }
    const count = num(row.conversions)
    day.conversions += count
    if (choice.category === "purchase") day.purchases += count
    if (choice.category === "lead") day.leads += count
    if (choice.includeValue && valueAllowed(choice)) day.revenue += num(row.conversionValue)
    days.set(row.date, day)
    byLine.set(lineId, days)
  }

  return [...byLine.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lineItemId, days]) => ({
      lineItemId,
      daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    }))
}

export type ConversionTotals = { conversions: number; purchases: number; leads: number; revenue: number }

export function sumConversionDays(
  days: readonly ConversionDay[],
  inWindow: (date: string) => boolean = () => true,
): ConversionTotals {
  const out: ConversionTotals = { conversions: 0, purchases: 0, leads: 0, revenue: 0 }
  for (const d of days) {
    if (!inWindow(d.date)) continue
    out.conversions += d.conversions
    out.purchases += d.purchases
    out.leads += d.leads
    out.revenue += d.revenue
  }
  return out
}

export function headlineCount(totals: ConversionTotals, headline: ConversionHeadline): number {
  return headline === "purchases" ? totals.purchases : headline === "leads" ? totals.leads : totals.conversions
}

/** Revenue ÷ spend. Null when spend is zero or missing. */
export function roas(revenue: number, spend: number): number | null {
  return Number.isFinite(spend) && spend > 0 && Number.isFinite(revenue) ? revenue / spend : null
}

/** Spend ÷ conversions. Null when there are no conversions. */
export function cpa(spend: number, conversions: number): number | null {
  return Number.isFinite(conversions) && conversions > 0 && Number.isFinite(spend) ? spend / conversions : null
}

/** Conversions ÷ clicks as a percentage. Null when there are no clicks. */
export function cvrPct(conversions: number, clicks: number): number | null {
  if (!(clicks > 0)) return null
  const rate = cvr(conversions, clicks)
  return rate == null ? null : rate * 100
}

export function formatRoas(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}x`
}
