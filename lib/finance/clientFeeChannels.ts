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
 *
 * Pure: no React, no server-only, so client and server code both import it.
 */

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

/** The 8 original fee columns. */
export type LegacyClientFeeField = Extract<Row, { since: "legacy" }>["field"]

/** The 12 fee columns added by migration 0113. */
export type ChannelClientFeeField = Extract<Row, { since: "0113" }>["field"]

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
