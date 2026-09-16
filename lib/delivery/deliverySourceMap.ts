/**
 * Programmatic delivery platform → source.
 *
 * Mirrors `delivery_source_map` (0063 AUTHOR ONLY; Channel Factory is 0074;
 * Twitch is 0075; Vistar/Broadsign are 0077). Do not SELECT the table until
 * 0063 is applied (C-76). `derive_spend_from_plan` is consumed by
 * `lib/delivery/deriveSpendFromPlanRate.ts` for modelled delivered spend on
 * cm360-sourced programmatic lines. Direct Booked Digital stays ZERO-$.
 * `partner_file` consumes the PACING_FACT channel for the line's family:
 * prog_video keeps the DSP video channel; prog_ooh is Programmatic - OOH.
 */

export type DeliverySource = "dsp" | "cm360" | "partner_file"

export type DeliverySourceMapRow = {
  publisher_key: string
  delivery_source: DeliverySource
  derive_spend_from_plan: boolean
  active: boolean
  notes: string | null
}

/** 0063 seed plus Channel Factory `partner_file` (0074), Twitch `cm360` (0075), Vistar/Broadsign `partner_file` (0077). Two Quantcast keys: prog vs digi strings genuinely differ. */
export const PROGRAMMATIC_DELIVERY_SOURCE_SEED: readonly DeliverySourceMapRow[] = [
  { publisher_key: "dv360", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "youtube - dv360", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "youtube-dv360", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "taboola", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "native - taboola", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "native", delivery_source: "dsp", derive_spend_from_plan: false, active: true, notes: null },
  { publisher_key: "quantcast - direct", delivery_source: "cm360", derive_spend_from_plan: true, active: true, notes: null },
  { publisher_key: "quantcast", delivery_source: "cm360", derive_spend_from_plan: true, active: true, notes: null },
  {
    publisher_key: "channel factory",
    delivery_source: "partner_file",
    derive_spend_from_plan: false,
    active: true,
    notes: "Datorama report 1248052 via partner-ingest. No platform cost.",
  },
  {
    publisher_key: "twitch",
    delivery_source: "cm360",
    derive_spend_from_plan: true,
    active: true,
    notes: "CM360 verification; modelled spend (Quantcast pattern).",
  },
  {
    publisher_key: "vistar",
    delivery_source: "partner_file",
    derive_spend_from_plan: false,
    active: true,
    notes: "Vistar exchange CSV via partner-ingest. PACING_FACT Programmatic - OOH.",
  },
  {
    publisher_key: "broadsign",
    delivery_source: "partner_file",
    derive_spend_from_plan: false,
    active: true,
    notes: "Broadsign buys on the Vistar exchange file. PACING_FACT Programmatic - OOH.",
  },
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
  lineChannel?: string,
): ReadonlySet<string> {
  if (source === "cm360") return new Set(["ad-serving"])
  if (source === "dsp") return new Set([dspChannel])
  if (source === "partner_file") {
    const family = String(lineChannel ?? "")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_")
    if (family === "prog_ooh" || family === "progooh") {
      return new Set(["programmatic-ooh"])
    }
    return new Set([dspChannel])
  }
  return new Set()
}
