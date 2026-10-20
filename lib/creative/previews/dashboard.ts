import { isPreviewPlatform } from "./core"

/** creative_preview_cache columns the dashboard reads. Nothing here leaves the server as-is. */
export type DashboardPreviewCacheRow = {
  platform: string
  creativeKey: string
  blobPathname: string | null
  previewKind: string | null
  viewUrl: string | null
  sourceHash: string | null
}

export type DashboardPreviewFields = {
  previewUrl: string | null
  previewKind: "image" | "video" | null
  viewUrl: string | null
  /** A CM360 video file (https://gcdn.2mdn.net/...) to play in the browser, or null. */
  videoUrl: string | null
}

const VIEW_URL_HOSTS = ["facebook.com", "fb.com", "fb.me", "instagram.com"]

/** The tenant-checked image route. `v` busts the browser cache when the source image changes. */
export function previewImagePath(platform: string, creativeKey: string, sourceHash?: string | null): string {
  const base = `/api/creative-previews/${encodeURIComponent(platform)}/${encodeURIComponent(creativeKey)}`
  const version = sourceHash?.trim().slice(0, 12)
  return version && /^[0-9a-f]+$/i.test(version) ? `${base}?v=${version}` : base
}

/** Only an https Facebook or Instagram page link. CDN hosts (fbcdn, tiktokcdn) never pass. */
export function safeViewUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const allowed = VIEW_URL_HOSTS.some((base) => host === base || host.endsWith(`.${base}`))
  return allowed ? url.toString() : null
}

/** Only an https CM360 video file on gcdn.2mdn.net. */
export function safeVideoUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  return url.hostname.toLowerCase() === "gcdn.2mdn.net" && url.pathname.startsWith("/videoplayback/")
    ? url.toString()
    : null
}

export function normalisePreviewKind(raw: string | null | undefined): "image" | "video" | null {
  const value = raw?.trim().toLowerCase()
  return value === "image" || value === "video" ? value : null
}

export function dashboardPreviewFields(row: DashboardPreviewCacheRow | undefined): DashboardPreviewFields {
  if (!row || !isPreviewPlatform(row.platform)) {
    return { previewUrl: null, previewKind: null, viewUrl: null, videoUrl: null }
  }
  const previewKind = normalisePreviewKind(row.previewKind)
  return {
    previewUrl: row.blobPathname?.trim()
      ? previewImagePath(row.platform, row.creativeKey, row.sourceHash)
      : null,
    previewKind,
    viewUrl: safeViewUrl(row.viewUrl),
    videoUrl: previewKind === "video" ? safeVideoUrl(row.viewUrl) : null,
  }
}

function cacheKey(platform: string, creativeKey: string): string {
  return `${platform.trim().toLowerCase()}\0${creativeKey}`
}

/** Replaces the preview fields on every row. Rows with no cache row get nulls. */
export function attachPreviewFields<T extends { platform: string; creativeKey: string }>(
  rows: T[],
  cache: DashboardPreviewCacheRow[],
): Array<T & DashboardPreviewFields> {
  const byKey = new Map(cache.map((row) => [cacheKey(row.platform, row.creativeKey), row]))
  return rows.map((row) => ({
    ...row,
    ...dashboardPreviewFields(byKey.get(cacheKey(row.platform, row.creativeKey))),
  }))
}
