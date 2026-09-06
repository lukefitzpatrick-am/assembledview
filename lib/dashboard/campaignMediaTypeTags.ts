import { getMediaLabel } from "@/lib/charts/registry"

/**
 * Campaign `mp_*` flags in list-pill order, paired with the compact key
 * `getMediaLabel` / `MEDIA_TYPE_REGISTRY` already understand.
 * Production is a registry channel but has no list pill.
 */
export const CAMPAIGN_LIST_MEDIA_TYPE_FLAGS = [
  ["mp_television", "television"],
  ["mp_radio", "radio"],
  ["mp_newspaper", "newspaper"],
  ["mp_magazines", "magazines"],
  ["mp_ooh", "ooh"],
  ["mp_cinema", "cinema"],
  ["mp_digidisplay", "digidisplay"],
  ["mp_digiaudio", "digiaudio"],
  ["mp_digivideo", "digivideo"],
  ["mp_bvod", "bvod"],
  ["mp_integration", "integration"],
  ["mp_search", "search"],
  ["mp_socialmedia", "socialmedia"],
  ["mp_progdisplay", "progdisplay"],
  ["mp_progvideo", "progvideo"],
  ["mp_progbvod", "progbvod"],
  ["mp_progaudio", "progaudio"],
  ["mp_progooh", "progooh"],
  ["mp_influencers", "influencers"],
] as const

export type CampaignMediaTypeFlagName = (typeof CAMPAIGN_LIST_MEDIA_TYPE_FLAGS)[number][0]

export type CampaignMediaTypeFlagFields = {
  [K in CampaignMediaTypeFlagName]?: unknown
}

export function isCampaignMediaTypeEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value === true
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1"
  if (typeof value === "number") return value === 1
  return false
}

/** Registry labels for enabled campaign channels (Home + `/mediaplans` pills). */
export function campaignMediaTypeTagLabels(plan: CampaignMediaTypeFlagFields): string[] {
  return CAMPAIGN_LIST_MEDIA_TYPE_FLAGS.flatMap(([flag, compactKey]) =>
    isCampaignMediaTypeEnabled(plan[flag]) ? [getMediaLabel(compactKey)] : [],
  )
}
