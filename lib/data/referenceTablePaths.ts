/**
 * Media-details reference tables eligible for DATA_BACKEND shadow/postgres reads.
 * Shared (browser-safe) — no db imports.
 */
export const REFERENCE_TABLE_PATHS = [
  "tv_stations",
  "radio_stations",
  "newspapers",
  "newspaper_adsizes",
  "magazines",
  "magazines_adsizes",
  "audio_site",
  "bvod_site",
  "display_site",
  "video_site",
] as const

export type ReferenceTablePath = (typeof REFERENCE_TABLE_PATHS)[number]

const REFERENCE_PATH_SET = new Set<string>(REFERENCE_TABLE_PATHS)

export function isReferenceTablePath(path: string): path is ReferenceTablePath {
  return REFERENCE_PATH_SET.has(path)
}
