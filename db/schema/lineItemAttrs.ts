import { z } from "zod"
import { LINE_CHANNELS, type LineChannel } from "./enums"

/** Optional text attr — Xano often stores null/empty for unused channel fields. */
const optText = z.string().nullish()

/**
 * Per-channel validators for `line_items.attrs`.
 * Fields derived from xano-tables-schema.json channel tables (2026-07-30),
 * excluding columns promoted to first-class `line_items` columns.
 * `.passthrough()` keeps legacy unknown keys.
 */
export const lineItemAttrsByChannel = {
  television: z
    .object({
      network: optText,
      station: optText,
      daypart: optText,
      placement: optText,
      creative: optText,
    })
    .passthrough(),
  radio: z
    .object({
      network: optText,
      station: optText,
      placement: optText,
      format: optText,
      duration: optText,
    })
    .passthrough(),
  cinema: z
    .object({
      network: optText,
      format: optText,
      station: optText,
      placement: optText,
      duration: optText,
    })
    .passthrough(),
  newspaper: z
    .object({
      network: optText,
      title: optText,
      size: optText,
      format: optText,
      placement: optText,
    })
    .passthrough(),
  magazines: z
    .object({
      network: optText,
      title: optText,
      size: optText,
      format: optText,
      placement: optText,
    })
    .passthrough(),
  ooh: z
    .object({
      network: optText,
      format: optText,
      type: optText,
      placement: optText,
      size: optText,
    })
    .passthrough(),
  prog_display: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  prog_video: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  prog_audio: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  prog_bvod: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  prog_ooh: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  digi_display: z
    .object({
      site: optText,
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  digi_video: z
    .object({
      site: optText,
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  digi_audio: z
    .object({
      site: optText,
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  digi_bvod: z
    .object({
      site: optText,
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  social: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  search: z
    .object({
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  influencers: z
    .object({
      objective: optText,
      campaign: optText,
      targeting_attribute: optText,
    })
    .passthrough(),
  integrations: z
    .object({
      objective: optText,
      campaign: optText,
      targeting_attribute: optText,
      creative_targeting: optText,
      creative: optText,
    })
    .passthrough(),
  production: z
    .object({
      media_type: optText,
      description: optText,
    })
    .passthrough(),
} as const satisfies Record<LineChannel, z.ZodTypeAny>

export type LineItemAttrsFor<C extends LineChannel> = z.infer<
  (typeof lineItemAttrsByChannel)[C]
>

export function attrsValidatorForChannel(channel: LineChannel) {
  return lineItemAttrsByChannel[channel]
}

export function parseLineItemAttrs(channel: LineChannel, attrs: unknown) {
  return lineItemAttrsByChannel[channel].parse(attrs ?? {})
}

/** Exhaustiveness helper for tests — every enum value must appear here. */
export const ATTRS_CHANNEL_KEYS = Object.keys(
  lineItemAttrsByChannel,
) as LineChannel[]

// Compile-time: missing channel key fails `satisfies Record<LineChannel, ...>`
void LINE_CHANNELS
