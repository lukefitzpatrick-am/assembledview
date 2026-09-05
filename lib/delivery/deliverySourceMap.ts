/**
 * Programmatic delivery platform → source.
 *
 * Mirrors `delivery_source_map` (0063 AUTHOR ONLY). Do not SELECT the table
 * until that migration is applied (C-76). `derive_spend_from_plan` is consumed
 * by `lib/delivery/deriveSpendFromPlanRate.ts` for modelled delivered spend on
 * cm360-sourced programmatic lines. Direct Booked Digital stays ZERO-$.
 */

export type DeliverySource = "dsp" | "cm360" | "partner_file"

export type DeliverySourceMapRow = {
  publisher_key: string
  delivery_source: DeliverySource
  derive_spend_from_plan: boolean
  active: boolean
  notes: string | null
}

/** Exact 0063 seed. Two Quantcast keys: prog vs digi strings genuinely differ. */
export const PROGRAMMATIC_DELIVERY_SOURCE_SEED: readonly DeliverySourceMapRow[] = [
  { publisher_key: "dv360", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "youtube - dv360", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "youtube-dv360", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "taboola", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "native - taboola", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "native", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "quantcast - direct", delivery_source: "cm360", derive_spend_from_plan: true, active: true, notes: null },
  { publisher_key: "quantcast", delivery_source: "cm360", derive_spend_from_plan: true, active: true, notes: null },
]

function trimLower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

/**
 * Lookup key is (publisher ?? platform), lowercased+trimmed.
 * Blank/whitespace publisher is treated as absent so platform-only DV360
 * lines still match (empty string is not a map key).
 */
export function deliverySourceLookupKey(publisher: unknown, platform: unknown): string {
  const pub = trimLower(publisher)
  if (pub) return pub
  return trimLower(platform)
}

export function lookupActiveDeliverySource(
  key: string,
  rows: readonly DeliverySourceMapRow[] = PROGRAMMATIC_DELIVERY_SOURCE_SEED,
): DeliverySourceMapRow | undefined {
  if (!key) return undefined
  const row = rows.find((r) => r.publisher_key === key)
  if (!row?.active) return undefined
  return row
}

/** Snowflake channel(s) a line may consume, given its map row. */
export function snowflakeChannelsForDeliverySource(
  source: DeliverySource,
  dspChannel: string,
): ReadonlySet<string> {
  if (source === "dsp") return new Set([dspChannel])
  if (source === "cm360") return new Set(["ad-serving"])
  return new Set()
}
