import type { ComboboxOption } from "@/components/ui/combobox"
import type { PacingMatchType } from "@/lib/xano/pacing-types"
import {
  MEDIA_TYPE_CONFIG,
  PLATFORM_LABELS,
  PACING_MAPPING_MEDIA_TYPES,
  allPlatformFilterOptions as distinctPlatformComboboxOptions,
  platformComboboxOptionsForMediaType,
  type PacingMappingMediaTypeKey,
} from "@/lib/pacing/media-type-config"

export {
  PLATFORM_LABELS,
  PACING_MAPPING_MEDIA_TYPES,
  type PacingMappingMediaTypeKey,
}

/** @deprecated Prefer MEDIA_TYPE_CONFIG from media-type-config */
export const PACING_MEDIA_TYPE_TO_PLATFORMS = {
  search: MEDIA_TYPE_CONFIG.search.platforms,
  social: MEDIA_TYPE_CONFIG.social.platforms,
  display: MEDIA_TYPE_CONFIG.display.platforms,
  bvod: MEDIA_TYPE_CONFIG.bvod.platforms,
  direct: MEDIA_TYPE_CONFIG.direct.platforms,
} as const satisfies Record<PacingMappingMediaTypeKey, readonly string[]>

export const MATCH_TYPE_OPTIONS: { value: PacingMatchType; label: string }[] = [
  { value: "suffix_id", label: "Suffix ID" },
  { value: "exact", label: "Exact" },
  { value: "prefix", label: "Prefix" },
  { value: "regex", label: "Regex" },
]

/** @deprecated Use platformComboboxOptionsForMediaType from media-type-config */
export const platformOptionsForMediaType = platformComboboxOptionsForMediaType

export function labelForPlatform(platform: string | null | undefined): string {
  if (!platform) return "—"
  const k = platform.trim()
  return PLATFORM_LABELS[k] ?? k
}

export function mediaTypeComboboxOptions(): ComboboxOption[] {
  return PACING_MAPPING_MEDIA_TYPES.map((v) => ({
    value: v,
    label: v.charAt(0).toUpperCase() + v.slice(1),
  }))
}

/** Distinct platforms across all media types (for filter dropdowns). */
export function allPlatformFilterOptions(): ComboboxOption[] {
  return distinctPlatformComboboxOptions()
}

/** Best-effort: media_plan_versions row may use `clients_id` or name fields only. */
export function mediaPlanBelongsToClient(
  plan: Record<string, unknown>,
  clientId: string,
  clientLabelNorm: string
): boolean {
  const cid = plan.clients_id ?? plan.client_id
  if (cid != null && String(cid).trim() === clientId) return true
  const name = String(plan.mp_client_name ?? plan.client_name ?? "").trim().toLowerCase()
  if (clientLabelNorm && name === clientLabelNorm) return true
  return false
}

export function parseMediaPlanVersionId(plan: Record<string, unknown>): number | null {
  const raw = plan.id ?? plan.media_plan_version_id
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10)
  return Number.isFinite(n) ? n : null
}
