export const PREVIEW_MARKER_0098 = "0098_ga4_gsc_accounts_and_creative_previews"
export const PREVIEW_MARKER_0102 = "0102_creative_preview_cache_source"

export const PREVIEW_0098_MISSING = "0098 not applied"
export const PREVIEW_0102_MISSING = "0102 not applied"

export type PreviewCacheGate = { ready: true } | { ready: false; message: string }

/** The cache table needs 0098; the source columns need 0102. */
export function previewCacheGate(appliedKeys: readonly string[]): PreviewCacheGate {
  const keys = new Set(appliedKeys)
  if (!keys.has(PREVIEW_MARKER_0098)) return { ready: false, message: PREVIEW_0098_MISSING }
  if (!keys.has(PREVIEW_MARKER_0102)) return { ready: false, message: PREVIEW_0102_MISSING }
  return { ready: true }
}
