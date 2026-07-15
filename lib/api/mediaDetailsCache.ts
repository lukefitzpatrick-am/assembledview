import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { xanoUrl } from "@/lib/api/xano"

/**
 * Durable cache for media-details reference lists (stations, sites, newspapers,
 * magazines, ad-sizes). Plan-independent; change rarely.
 *
 * Auth / allowlist gating stay outside this module (route handler).
 */

export const MEDIA_DETAILS_TAG = "media-details"
const REVALIDATE_SECONDS = 900 // 15 min (within 600–1800s brief range)

/** Single-segment GET paths that are global reference lists. */
export const MEDIA_DETAILS_REFERENCE_LIST_PATHS = new Set([
  "tv_stations",
  "radio_stations",
  "newspapers",
  "newspaper_adsizes",
  "magazines",
  "magazines_adsizes",
  "audio_site",
  "video_site",
  "display_site",
  "bvod_site",
])

export type MediaDetailsCachedPayload = {
  status: number
  contentType: string
  /** Parsed JSON value, or raw text when not application/json. */
  body: unknown
}

export function isMediaDetailsReferenceListPath(path: string): boolean {
  return MEDIA_DETAILS_REFERENCE_LIST_PATHS.has(path)
}

/**
 * True for reference-list GETs and their mutation counterparts
 * (`POST_tv_stations`, `audio_site` POST, etc.) so writes can bust the tag.
 */
export function isMediaDetailsReferenceRelatedPath(path: string): boolean {
  if (MEDIA_DETAILS_REFERENCE_LIST_PATHS.has(path)) return true
  if (path.startsWith("POST_") && MEDIA_DETAILS_REFERENCE_LIST_PATHS.has(path.slice(5))) {
    return true
  }
  return false
}

function applySearchParams(url: URL, searchParams: URLSearchParams) {
  searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })
}

/** Stable query key so `?a=1&b=2` and `?b=2&a=1` share a cache entry. */
export function mediaDetailsQueryCacheKey(searchParams: URLSearchParams): string {
  const pairs = Array.from(searchParams.entries()).sort(([a], [b]) => a.localeCompare(b))
  if (pairs.length === 0) return ""
  const sorted = new URLSearchParams()
  for (const [key, value] of pairs) {
    sorted.append(key, value)
  }
  return sorted.toString()
}

async function fetchUpstream(
  path: string,
  searchParams: URLSearchParams
): Promise<MediaDetailsCachedPayload> {
  const targetUrl = xanoUrl(path, "XANO_MEDIA_DETAILS_BASE_URL")
  const url = new URL(targetUrl)
  applySearchParams(url, searchParams)

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()

  return {
    status: upstream.status,
    contentType,
    body,
  }
}

/**
 * Cached GET for a known reference-list path.
 * Keyed by path + sorted query string.
 * Non-2xx responses are returned to the caller but not stored in the Data Cache.
 */
export async function getCachedMediaDetailsReference(
  path: string,
  searchParams: URLSearchParams
): Promise<MediaDetailsCachedPayload> {
  const queryKey = mediaDetailsQueryCacheKey(searchParams)
  // Capture a plain snapshot for the cached closure (URLSearchParams is mutable).
  const pairs = Array.from(searchParams.entries())

  try {
    const cached = unstable_cache(
      async () => {
        const params = new URLSearchParams()
        for (const [key, value] of pairs) {
          params.append(key, value)
        }
        const result = await fetchUpstream(path, params)
        if (result.status < 200 || result.status >= 300) {
          const err = new Error(
            `media-details upstream ${result.status}`
          ) as Error & { payload: MediaDetailsCachedPayload }
          err.payload = result
          throw err
        }
        return result
      },
      ["media-details", path, queryKey],
      { revalidate: REVALIDATE_SECONDS, tags: [MEDIA_DETAILS_TAG] }
    )
    return await cached()
  } catch (err) {
    if (err && typeof err === "object" && "payload" in err) {
      return (err as { payload: MediaDetailsCachedPayload }).payload
    }
    throw err
  }
}

/** Bust all media-details reference Data Cache entries after a write. */
export function invalidateMediaDetailsCache() {
  revalidateTag(MEDIA_DETAILS_TAG)
}
