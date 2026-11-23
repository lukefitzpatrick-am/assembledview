/**
 * Client fee channels (B22): the one list of the 20 client fee columns.
 *
 * Every client fee field, its editor media type, its label and its rules
 * come from CLIENT_FEE_CHANNELS. Fee maps, form fields, the write path, Ava
 * and the editors derive from it; nothing else lists the fee columns.
 *
 * Rules (INVARIANTS):
 * - Values are whole percents (20 = 20%), nullable. Null or absent is 0%.
 * - Influencers with no rate of its own inherits Content Creator
 *   (feeinfluencers ?? feecontentcreator). An explicit 0 is a real 0%.
 * - Production never bills a fee. Its row maps to feecontentcreator, which is
 *   the Influencers fallback only.
 * - The 12 fields added by migration 0113 are read only with the switch
 *   channel_client_fees on (lib/features/registry.ts).
 * - A rate can change from a date (S4, client_fee_rates, switch
 *   client_fee_rate_history). The rate on a date is the latest dated change
 *   on or before it, else the clients column (clientFeeRateOn).
 *
 * Pure: no React, no server-only, so client and server code both import it.
 */

import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

export type ClientFeeChannelGroup =
  | "traditional"
  | "direct_digital"
  | "search_social"
  | "programmatic"
  | "content"

type ClientFeeChannelRow = {
  /** Editor and schedule media type key (ScheduleMediaTypeKey). */
  mediaType: string
  /** Column on clients, and the key in FeeLoading and mba_fee_snapshots.fees. */
  field: string
  /** Form label. */
  label: string
  group: ClientFeeChannelGroup
  /** "legacy": the 8 original columns. "0113": the 12 added on 2 Nov 2026. */
  since: "legacy" | "0113"
  /** Place on the client form (the clients table column order). */
  formOrder: number
  /** Field used when this one is null or absent. */
  inheritsFrom?: string
  /** false: the channel never bills a client fee (production). */
  feeBearing: boolean
}

/** Same order as the editor media types (FEE_FIELD_BY_MEDIA). */
export const CLIENT_FEE_CHANNELS = [
  { mediaType: "television", field: "feetelevision", label: "Television", group: "traditional", since: "0113", formOrder: 9, feeBearing: true },
  { mediaType: "radio", field: "feeradio", label: "Radio", group: "traditional", since: "0113", formOrder: 10, feeBearing: true },
  { mediaType: "newspaper", field: "feenewspapers", label: "Newspapers", group: "traditional", since: "0113", formOrder: 11, feeBearing: true },
  { mediaType: "magazines", field: "feemagazines", label: "Magazines", group: "traditional", since: "0113", formOrder: 12, feeBearing: true },
  { mediaType: "ooh", field: "feeooh", label: "OOH", group: "traditional", since: "0113", formOrder: 13, feeBearing: true },
  { mediaType: "cinema", field: "feecinema", label: "Cinema", group: "traditional", since: "0113", formOrder: 14, feeBearing: true },
  { mediaType: "digiDisplay", field: "feedigidisplay", label: "Digital Display", group: "direct_digital", since: "0113", formOrder: 15, feeBearing: true },
  { mediaType: "digiAudio", field: "feedigiaudio", label: "Digital Audio", group: "direct_digital", since: "0113", formOrder: 16, feeBearing: true },
  { mediaType: "digiVideo", field: "feedigivideo", label: "Digital Video", group: "direct_digital", since: "0113", formOrder: 17, feeBearing: true },
  { mediaType: "bvod", field: "feebvod", label: "BVOD", group: "direct_digital", since: "0113", formOrder: 18, feeBearing: true },
  { mediaType: "integration", field: "feeintegration", label: "Integration", group: "content", since: "0113", formOrder: 19, feeBearing: true },
  { mediaType: "search", field: "feesearch", label: "Search", group: "search_social", since: "legacy", formOrder: 2, feeBearing: true },
  { mediaType: "socialMedia", field: "feesocial", label: "Social Media", group: "search_social", since: "legacy", formOrder: 1, feeBearing: true },
  { mediaType: "progDisplay", field: "feeprogdisplay", label: "Prog Display", group: "programmatic", since: "legacy", formOrder: 3, feeBearing: true },
  { mediaType: "progVideo", field: "feeprogvideo", label: "Prog Video", group: "programmatic", since: "legacy", formOrder: 4, feeBearing: true },
  { mediaType: "progBvod", field: "feeprogbvod", label: "Prog BVOD", group: "programmatic", since: "legacy", formOrder: 5, feeBearing: true },
  { mediaType: "progAudio", field: "feeprogaudio", label: "Prog Audio", group: "programmatic", since: "legacy", formOrder: 6, feeBearing: true },
  { mediaType: "progOoh", field: "feeprogooh", label: "Prog OOH", group: "programmatic", since: "legacy", formOrder: 7, feeBearing: true },
  { mediaType: "influencers", field: "feeinfluencers", label: "Influencers", group: "content", since: "0113", formOrder: 20, inheritsFrom: "feecontentcreator", feeBearing: true },
  { mediaType: "production", field: "feecontentcreator", label: "Content Creator", group: "content", since: "legacy", formOrder: 8, feeBearing: false },
] as const satisfies readonly ClientFeeChannelRow[]

type Row = (typeof CLIENT_FEE_CHANNELS)[number]

/** The 20 fee columns on a clients record. */
export type ClientFeeField = Row["field"]

/** Every fee field, list order. */
export const CLIENT_FEE_FIELDS: readonly ClientFeeField[] = CLIENT_FEE_CHANNELS.map((c) => c.field)

/** The 20 editor media types, list order. */
export const CLIENT_FEE_MEDIA_TYPES: readonly Row["mediaType"][] = CLIENT_FEE_CHANNELS.map((c) => c.mediaType)

/** Media type to its client fee field. */
export const CLIENT_FEE_FIELD_BY_MEDIA = Object.fromEntries(
  CLIENT_FEE_CHANNELS.map((c) => [c.mediaType, c.field]),
) as { readonly [R in Row as R["mediaType"]]: R["field"] }

/** The 8 original fields, list order. */
export const LEGACY_CLIENT_FEE_FIELDS = CLIENT_FEE_CHANNELS.filter(
  (c): c is Extract<Row, { since: "legacy" }> => c.since === "legacy",
).map((c) => c.field)

/** The 12 fields added by 0113, list order. */
export const CHANNEL_CLIENT_FEE_FIELDS = CLIENT_FEE_CHANNELS.filter(
  (c): c is Extract<Row, { since: "0113" }> => c.since === "0113",
).map((c) => c.field)

/** Rows of one kind in client form order (the clients table column order). */
export function clientFeeFormRows<S extends Row["since"]>(since: S): readonly Extract<Row, { since: S }>[] {
  return CLIENT_FEE_CHANNELS.filter((c): c is Extract<Row, { since: S }> => c.since === since).sort(
    (a, b) => a.formOrder - b.formOrder,
  )
}

/**
 * One dated client fee rate change (a client_fee_rates row, S4). The server
 * attaches a client's changes to its row as `fee_rate_changes` while the
 * switch client_fee_rate_history is on.
 */
export type ClientFeeRateChange = {
  field: ClientFeeField
  /** Whole percent, 0 to 100. */
  ratePct: number
  /** Melbourne civil date the rate takes effect from, YYYY-MM-DD. */
  effectiveFrom: string
}

/** The client row key that carries the dated changes. */
export const CLIENT_FEE_RATE_CHANGES_KEY = "fee_rate_changes"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * S4: the one rule for a client's fee rate on a date. The latest dated change
 * for the field on or before `onDate` (a Melbourne civil date, YYYY-MM-DD),
 * else the clients column value (the rate before the first dated change).
 * Dates compare as text, which orders YYYY-MM-DD correctly. Throws on a date
 * that isn't YYYY-MM-DD: a guessed date is a wrong fee.
 */
function clientFeeRateOn(
  row: Readonly<Record<string, unknown>>,
  changes: readonly ClientFeeRateChange[],
  field: ClientFeeField,
  onDate: string,
): unknown {
  if (!ISO_DAY.test(onDate)) throw new Error(`clientFeeRateOn: date must be YYYY-MM-DD, got ${onDate}`)
  let best: ClientFeeRateChange | null = null
  for (const change of changes) {
    if (change.field !== field || change.effectiveFrom > onDate) continue
    if (!best || change.effectiveFrom > best.effectiveFrom) best = change
  }
  return best ? best.ratePct : row[field]
}

/** The row's dated changes, keeping only well-formed entries. */
function rateChangesOf(row: Readonly<Record<string, unknown>>): ClientFeeRateChange[] {
  const raw = row[CLIENT_FEE_RATE_CHANGES_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (c): c is ClientFeeRateChange =>
      c != null &&
      typeof c === "object" &&
      (CLIENT_FEE_FIELDS as readonly unknown[]).includes(c.field) &&
      typeof c.ratePct === "number" &&
      Number.isFinite(c.ratePct) &&
      typeof c.effectiveFrom === "string" &&
      ISO_DAY.test(c.effectiveFrom),
  )
}

/** Editor fee state from a client row: one entry per fee field the row has. */
export type ClientFeeState = Partial<Record<ClientFeeField, number | null>>

/** Whole percent from a client column value. Numeric strings become numbers; anything else is null. */
function feeValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * The one place a client row becomes editor fee state (B22). The edit and
 * create pages both call it.
 *
 * - A field the row doesn't have is left out, so the edit page keeps its
 *   current state for it (as before).
 * - channelFees false (switch channel_client_fees off): the 12 fields from
 *   0113 are treated as absent, exactly as before the columns existed.
 * - Influencers is its own rate, else Content Creator (inheritsFrom), else
 *   null. With the switch off it is always Content Creator. An explicit 0 is
 *   kept as 0%. Present when either field is present, so the published
 *   mba_fee_snapshots.fees keeps its feeinfluencers key.
 * - S4: when the row carries dated changes (`fee_rate_changes`), each field
 *   is its rate on `onDate` (clientFeeRateOn): the plan's start date, as a
 *   Melbourne civil date (today in Melbourne when not given). No changes:
 *   the columns, as before.
 */
export function clientFeeStateFromRow(
  row: Readonly<Record<string, unknown>> | null | undefined,
  opts: { channelFees: boolean; onDate?: string | null },
): ClientFeeState {
  const state: ClientFeeState = {}
  if (!row) return state
  const changes = rateChangesOf(row)
  const read = (field: ClientFeeField): unknown =>
    changes.length > 0 ? clientFeeRateOn(row, changes, field, opts.onDate || getMelbourneTodayISO()) : row[field]
  const has = (field: string) => opts.channelFees || !(CHANNEL_CLIENT_FEE_FIELDS as readonly string[]).includes(field)
  for (const channel of CLIENT_FEE_CHANNELS) {
    const own = has(channel.field) ? read(channel.field) : undefined
    if ("inheritsFrom" in channel) {
      const inherited = read(channel.inheritsFrom)
      if (own === undefined && inherited === undefined) continue
      state[channel.field] = feeValue(own) ?? feeValue(inherited)
      continue
    }
    if (own === undefined) continue
    state[channel.field] = feeValue(own)
  }
  return state
}
