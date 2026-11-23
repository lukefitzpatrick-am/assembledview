/**
 * S7: a line's tracking type says what kind of delivery data it has, so
 * pacing compares like with like. Stored as `line_items.attrs.tracking_type`
 * when the planner picks one; otherwise the line resolves from what it
 * already says (a supplier file pacing reads, No Ad Serving), then its channel default.
 * Client-safe: the plan editor and the pacing readers share it.
 */
import type { LineChannel } from "@/db/schema/lineChannelValues"
import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
} from "@/lib/delivery/deliverySourceMap"
import { isDirectDigitalPartnerFileLine } from "@/lib/delivery/directDigitalPartnerFile"
import { isNoSourceDigitalLine } from "@/lib/spend/assumeSpendRule"

export const TRACKING_TYPES = ["tracked", "supplier_reported", "assumed", "not_tracked"] as const

export type TrackingType = (typeof TRACKING_TYPES)[number]

export const TRACKING_TYPE_LABELS: Readonly<Record<TrackingType, string>> = {
  tracked: "Tracked",
  supplier_reported: "Supplier reported",
  assumed: "Assumed",
  not_tracked: "Not tracked",
}

/**
 * Each channel's default, matching what pacing does today for a line with no
 * flags: platform or ad server data (tracked), even assumed spend for the six
 * offline families, and no delivery read at all for the rest.
 */
const CHANNEL_TRACKING_DEFAULT: Readonly<Record<LineChannel, TrackingType>> = {
  television: "assumed",
  radio: "assumed",
  cinema: "assumed",
  newspaper: "assumed",
  magazines: "assumed",
  ooh: "assumed",
  prog_display: "tracked",
  prog_video: "tracked",
  prog_audio: "tracked",
  prog_bvod: "tracked",
  prog_ooh: "tracked",
  digi_display: "tracked",
  digi_video: "tracked",
  digi_audio: "tracked",
  digi_bvod: "tracked",
  social: "tracked",
  search: "tracked",
  influencers: "not_tracked",
  integrations: "not_tracked",
  production: "not_tracked",
}

export function isTrackingType(value: unknown): value is TrackingType {
  return (TRACKING_TYPES as readonly unknown[]).includes(value)
}

/** Saved row (snake), form line (camel) or the editor's `noadserving` key. */
type TrackingTypeLine = {
  tracking_type?: unknown
  trackingType?: unknown
  publisher?: unknown
  platform?: unknown
  no_adserving?: unknown
  noAdserving?: unknown
  noadserving?: unknown
}

/** The line's own choice, or null when it has none (or an unknown value). */
function ownTrackingType(line: TrackingTypeLine): TrackingType | null {
  const own = line.tracking_type ?? line.trackingType
  return isTrackingType(own) ? own : null
}

/** What the line resolves to without its own choice: its flags, then the channel. */
export function defaultTrackingType(channel: LineChannel, line: TrackingTypeLine): TrackingType {
  const source = lookupActiveDeliverySource(deliverySourceLookupKey(line.publisher, line.platform))
  // Pacing reads supplier rows only for programmatic lines and Channel Factory Digital Video (HF1).
  const readsPartnerRows =
    channel.startsWith("prog_") ||
    (channel === "digi_video" && isDirectDigitalPartnerFileLine("digital-video", line.publisher, line.platform))
  if (source?.delivery_source === "partner_file" && readsPartnerRows) return "supplier_reported"
  const noAdserving = line.no_adserving === true || line.noAdserving === true || line.noadserving === true
  const publisher = typeof line.publisher === "string" ? line.publisher : null
  const platform = typeof line.platform === "string" ? line.platform : null
  if (isNoSourceDigitalLine({ sourceTable: `media_plan_${channel}`, noAdserving, publisher, platform })) {
    return "assumed"
  }
  return CHANNEL_TRACKING_DEFAULT[channel]
}

/** The one resolver: the line's own value, else its default. */
export function resolveTrackingType(channel: LineChannel, line: TrackingTypeLine): TrackingType {
  return ownTrackingType(line) ?? defaultTrackingType(channel, line)
}

/**
 * `{ [key]: type }` when the line has its own choice, else `{}`, so a line
 * nobody set saves and hydrates exactly as before. A stored choice stays even
 * when the line's default later equals it (Luke, S7 Q2 A).
 */
export function ownTrackingTypeEntry<K extends string>(key: K, line: TrackingTypeLine): { [P in K]?: TrackingType } {
  const own = ownTrackingType(line)
  return (own ? { [key]: own } : {}) as { [P in K]?: TrackingType }
}
