/**
 * Display order for Client KPI slide-out media-type groups (KPI-1).
 * Slugs match `MEDIA_TYPE_OPTIONS` in `lib/kpi/types.ts` (client hub canonical).
 * Digital channels first; broadcast / print / other after. Grouping/UI only —
 * does not change write or Xano sync paths.
 */

import { MEDIA_TYPE_OPTIONS } from "@/lib/kpi/types"
import { mediaTypeMatchesKpiRow } from "@/lib/kpi/matching"

/** Digital first (KPI-1), then remaining digital siblings, then broadcast/print/other. */
export const CLIENT_KPI_MEDIA_TYPE_ORDER = [
  "socialMedia",
  "search",
  "progDisplay",
  "progVideo",
  "digitalDisplay",
  "bvod",
  "digitalVideo",
  "digitalAudio",
  "progBvod",
  "progAudio",
  "progOoh",
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "influencers",
  "integration",
  "production",
] as const

export type ClientKpiMediaTypeSlug = (typeof CLIENT_KPI_MEDIA_TYPE_ORDER)[number]

export const CLIENT_KPI_DIGITAL_BAND_END_INDEX = 11 // exclusive: first 11 are digital

const LABEL_BY_SLUG = new Map(
  MEDIA_TYPE_OPTIONS.map((o) => [o.value, o.label] as const),
)

export function clientKpiMediaTypeLabel(slug: string): string {
  return LABEL_BY_SLUG.get(slug) ?? slug
}

/** Map a stored `media_type` onto a display-group slug, or null if unknown. */
export function resolveClientKpiGroupSlug(mediaType: string): string | null {
  const trimmed = mediaType.trim()
  if (!trimmed) return null
  for (const slug of CLIENT_KPI_MEDIA_TYPE_ORDER) {
    if (mediaTypeMatchesKpiRow(slug, trimmed) || mediaTypeMatchesKpiRow(trimmed, slug)) {
      return slug
    }
  }
  return null
}

export type ClientKpiMediaBand = "digital" | "other"

export function clientKpiMediaBand(slug: string): ClientKpiMediaBand {
  const idx = (CLIENT_KPI_MEDIA_TYPE_ORDER as readonly string[]).indexOf(slug)
  if (idx >= 0 && idx < CLIENT_KPI_DIGITAL_BAND_END_INDEX) return "digital"
  return "other"
}

export type ClientKpiGroupedBucket<T> = {
  slug: string
  label: string
  band: ClientKpiMediaBand
  items: T[]
}

/**
 * Bucket rows by media-type group. Unknown / blank media types land in `otherSlug`
 * (default `"__other__"`) at the end.
 */
export function groupClientKpisByMediaType<T extends { media_type: string }>(
  rows: T[],
  otherSlug = "__other__",
): ClientKpiGroupedBucket<T>[] {
  const bySlug = new Map<string, T[]>()
  for (const slug of CLIENT_KPI_MEDIA_TYPE_ORDER) {
    bySlug.set(slug, [])
  }
  bySlug.set(otherSlug, [])

  for (const row of rows) {
    const slug = resolveClientKpiGroupSlug(row.media_type) ?? otherSlug
    const list = bySlug.get(slug) ?? bySlug.get(otherSlug)!
    list.push(row)
  }

  const buckets: ClientKpiGroupedBucket<T>[] = []
  for (const slug of CLIENT_KPI_MEDIA_TYPE_ORDER) {
    buckets.push({
      slug,
      label: clientKpiMediaTypeLabel(slug),
      band: clientKpiMediaBand(slug),
      items: bySlug.get(slug) ?? [],
    })
  }
  const otherItems = bySlug.get(otherSlug) ?? []
  if (otherItems.length > 0) {
    buckets.push({
      slug: otherSlug,
      label: "Other",
      band: "other",
      items: otherItems,
    })
  }
  return buckets
}
