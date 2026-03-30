import Fuse from "fuse.js"

/** Canonical options for OOH fields used for fuzzy matching */
export const OOH_FORMAT_OPTIONS = [
  "active",
  "large_format",
  "other",
  "retail",
  "small_format",
  "street_furniture",
  "transit",
] as const

export const OOH_BUY_TYPE_OPTIONS = [
  "bonus",
  "cpm",
  "fixed_cost",
  "package",
  "panels",
] as const

export type OohFormatOption = (typeof OOH_FORMAT_OPTIONS)[number]
export type OohBuyTypeOption = (typeof OOH_BUY_TYPE_OPTIONS)[number]

/** Labels mirror OOH standard-mode combobox (OOHContainer). */
export const OOH_FORMAT_LABEL_BY_VALUE: Record<string, string> = {
  active: "Active",
  large_format: "Large Format",
  other: "Other",
  retail: "Retail",
  small_format: "Small Format",
  street_furniture: "Street Furniture",
  transit: "Transit",
}

export const OOH_BUY_TYPE_LABEL_BY_VALUE: Record<string, string> = {
  bonus: "Bonus",
  cpm: "CPM",
  fixed_cost: "Fixed Cost",
  package: "Package",
  panels: "Panels",
}

const formatFuseItems = OOH_FORMAT_OPTIONS.map((value) => ({
  value,
  label: OOH_FORMAT_LABEL_BY_VALUE[value] ?? value,
}))

const buyTypeFuseItems = OOH_BUY_TYPE_OPTIONS.map((value) => ({
  value,
  label: OOH_BUY_TYPE_LABEL_BY_VALUE[value] ?? value,
}))

const formatFuse = new Fuse(formatFuseItems, {
  keys: ["value", "label"],
  threshold: 0.4,
  includeScore: true,
})

const buyTypeFuse = new Fuse(buyTypeFuseItems, {
  keys: ["value", "label"],
  threshold: 0.4,
  includeScore: true,
})

function createNetworkFuse(networks: string[]) {
  return new Fuse(
    networks.map((v) => ({ value: v })),
    { keys: ["value"], threshold: 0.4, includeScore: true }
  )
}

export interface FuzzyMatchResult<T> {
  matched: T
  original: string
  score: number
}

/** If input is already a canonical value or standard label, return canonical; else null. */
export function exactCanonicalFormat(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const byValue = OOH_FORMAT_OPTIONS.find(
    (o) => o.toLowerCase() === trimmed.toLowerCase()
  )
  if (byValue) return byValue
  const byLabel = formatFuseItems.find(
    (e) => e.label.toLowerCase() === trimmed.toLowerCase()
  )
  return byLabel ? byLabel.value : null
}

export function exactCanonicalBuyType(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const byValue = OOH_BUY_TYPE_OPTIONS.find(
    (o) => o.toLowerCase() === trimmed.toLowerCase()
  )
  if (byValue) return byValue
  const byLabel = buyTypeFuseItems.find(
    (e) => e.label.toLowerCase() === trimmed.toLowerCase()
  )
  return byLabel ? byLabel.value : null
}

/**
 * Find best fuzzy match for format. Returns null if input is empty or exact canonical/label match.
 */
export function fuzzyMatchFormat(input: string): FuzzyMatchResult<string> | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (exactCanonicalFormat(trimmed) !== null) return null
  const results = formatFuse.search(trimmed)
  const best = results[0]
  if (!best || (best.score != null && best.score > 0.6)) return null
  return {
    matched: best.item.value,
    original: trimmed,
    score: best.score ?? 1,
  }
}

/**
 * Find best fuzzy match for buy type. Returns null if input is empty or exact canonical/label match.
 */
export function fuzzyMatchBuyType(input: string): FuzzyMatchResult<string> | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (exactCanonicalBuyType(trimmed) !== null) return null
  const results = buyTypeFuse.search(trimmed)
  const best = results[0]
  if (!best || (best.score != null && best.score > 0.6)) return null
  return {
    matched: best.item.value,
    original: trimmed,
    score: best.score ?? 1,
  }
}

/**
 * Find best fuzzy match for network from publisher list.
 * Returns null if input is empty or exact match.
 */
export function fuzzyMatchNetwork(
  input: string,
  networks: string[]
): FuzzyMatchResult<string> | null {
  const trimmed = input.trim()
  if (!trimmed || networks.length === 0) return null
  const exact = networks.find((n) => n.toLowerCase() === trimmed.toLowerCase())
  if (exact) return null
  const fuse = createNetworkFuse(networks)
  const results = fuse.search(trimmed)
  const best = results[0]
  if (!best || (best.score != null && best.score > 0.6)) return null
  return {
    matched: best.item.value,
    original: trimmed,
    score: best.score ?? 1,
  }
}

/** Fuzzy match station label against known stations (same logic as {@link fuzzyMatchNetwork}). */
export function fuzzyMatchStation(
  input: string,
  stations: string[]
): FuzzyMatchResult<string> | null {
  return fuzzyMatchNetwork(input, stations)
}
