import type { ComboboxOption } from "@/components/ui/combobox"
import type { PacingMatchType } from "@/lib/xano/pacing-types"

/** Performance columns shown in DeliveryPacingDrawer (delivery breakdown tab). */
export type PerformanceColumnKey =
  | "impressions"
  | "reach"
  | "frequency"
  | "viewable_impressions"
  | "viewability"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "conversions"
  | "cpa"
  | "roas"
  | "completed_views"
  | "vcr"
  | "delivery_pct"

export type MediaTypeConfigEntry = {
  performanceColumns: PerformanceColumnKey[]
  /** Lowercase API / mapping platform keys, e.g. meta, google_ads */
  platforms: readonly string[]
  /** Default `match_type` when creating a new mapping in the UI */
  defaultMatchType?: PacingMatchType
  /** If set, "New mapping" shows a confirmation before opening the editor */
  autoSyncSource?: string
}

export const PACING_MAPPING_MEDIA_TYPES = ["search", "social", "display", "bvod", "direct"] as const

export type PacingMappingMediaTypeKey = (typeof PACING_MAPPING_MEDIA_TYPES)[number]

/**
 * Canonical pacing behaviour by Snowflake / UI `media_type`.
 * Keep in sync with Xano pacing_mappings.media_type and Snowflake line items.
 */
export const MEDIA_TYPE_CONFIG: Record<PacingMappingMediaTypeKey, MediaTypeConfigEntry> = {
  search: {
    performanceColumns: ["impressions", "clicks", "ctr", "cpc", "conversions", "cpa", "roas"],
    platforms: ["google_ads"],
    defaultMatchType: "suffix_id",
    autoSyncSource: "search_containers",
  },
  social: {
    performanceColumns: [
      "impressions",
      "reach",
      "frequency",
      "clicks",
      "ctr",
      "cpc",
      "conversions",
      "cpa",
      "roas",
    ],
    platforms: ["meta", "tiktok", "linkedin"],
  },
  display: {
    performanceColumns: [
      "impressions",
      "viewable_impressions",
      "viewability",
      "clicks",
      "ctr",
      "cpm",
    ],
    platforms: ["dv360", "google_ads"],
  },
  bvod: {
    performanceColumns: ["impressions", "completed_views", "vcr", "cpm"],
    platforms: ["dv360", "the_trade_desk"],
  },
  direct: {
    performanceColumns: ["impressions", "delivery_pct"],
    platforms: ["direct"],
  },
}

export const PLATFORM_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  dv360: "DV360",
  meta: "Meta",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  the_trade_desk: "The Trade Desk",
  direct: "Direct",
}

export function getMediaTypeConfig(mediaType: string | null | undefined): MediaTypeConfigEntry {
  const key = String(mediaType ?? "search").trim().toLowerCase() as PacingMappingMediaTypeKey
  return MEDIA_TYPE_CONFIG[key] ?? MEDIA_TYPE_CONFIG.search
}

export function getDefaultMatchTypeForNewMapping(mediaType: string): PacingMatchType {
  return getMediaTypeConfig(mediaType).defaultMatchType ?? "exact"
}

export function mediaTypeHasAutoSyncSource(mediaType: string): boolean {
  return Boolean(getMediaTypeConfig(mediaType).autoSyncSource)
}

/** Confirmation copy when opening manual "New mapping" for an auto-synced media type */
export function getAutoSyncNewMappingConfirmMessage(mediaType: string): string | null {
  if (!getMediaTypeConfig(mediaType).autoSyncSource) return null
  return "This media type syncs automatically. Continue only if you need a manual override."
}

export function platformComboboxOptionsForMediaType(mediaType: string): ComboboxOption[] {
  const plats = getMediaTypeConfig(mediaType).platforms
  return plats.map((p) => ({
    value: p,
    label: PLATFORM_LABELS[p] ?? p,
  }))
}

export function allPlatformFilterOptions(): ComboboxOption[] {
  const set = new Set<string>()
  for (const c of Object.values(MEDIA_TYPE_CONFIG) as MediaTypeConfigEntry[]) {
    for (const p of c.platforms) set.add(p)
  }
  return [...set]
    .sort()
    .map((p) => ({ value: p, label: PLATFORM_LABELS[p] ?? p }))
}

export const PERFORMANCE_COLUMN_LABELS: Record<PerformanceColumnKey, string> = {
  impressions: "Impr.",
  reach: "Reach",
  frequency: "Freq.",
  viewable_impressions: "Viewable impr.",
  viewability: "Viewability",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  conversions: "Conv.",
  cpa: "CPA",
  roas: "ROAS",
  completed_views: "Completed views",
  vcr: "VCR",
  delivery_pct: "Delivery %",
}
