import "server-only"

import fs from "node:fs"
import path from "node:path"
import { BRAND_ASSET_BASE_URL } from "@/lib/config/endpoints"

export const BRAND_STORE_HOST = new URL(BRAND_ASSET_BASE_URL).hostname
export const COVER_PHOTO_TIMEOUT_MS = 10_000

export type BrandAssetKind = "logo" | "photo"

export type BrandAsset = {
  id: string
  kind: BrandAssetKind
  name: string
  description: string
  tags: string[]
  url: string
}

export type BrandAssetQuery = {
  kind?: BrandAssetKind | null
  query?: string | null
}

let cached: BrandAsset[] | null = null

export function brandAssetCatalogPath(): string {
  return path.join(process.cwd(), "lib", "ava", "brand", "assetCatalog.json")
}

export function loadBrandAssetCatalog(): BrandAsset[] {
  if (cached) return cached
  const raw = fs.readFileSync(brandAssetCatalogPath(), "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error("brand asset catalogue is not an array")
  cached = parsed.filter(isBrandAsset)
  return cached
}

export function __resetBrandAssetCatalogForTests(): void {
  cached = null
}

function isBrandAsset(value: unknown): value is BrandAsset {
  if (!value || typeof value !== "object") return false
  const row = value as BrandAsset
  return (
    typeof row.id === "string" &&
    (row.kind === "logo" || row.kind === "photo") &&
    typeof row.name === "string" &&
    typeof row.description === "string" &&
    Array.isArray(row.tags) &&
    typeof row.url === "string"
  )
}

export function brandAssetUrlIsAllowed(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname === BRAND_STORE_HOST
  } catch {
    return false
  }
}

export function matchBrandAssets(
  catalog: readonly BrandAsset[],
  query: BrandAssetQuery,
  limit = 12,
): { assets: BrandAsset[]; truncated: number } {
  const kind = query.kind === "logo" || query.kind === "photo" ? query.kind : null
  const needle = (query.query ?? "").trim().toLowerCase()
  const matched = catalog.filter((asset) => {
    if (kind && asset.kind !== kind) return false
    if (!needle) return true
    const haystack = [asset.id, asset.name, asset.description, ...asset.tags]
      .join(" ")
      .toLowerCase()
    return haystack.includes(needle)
  })
  return {
    assets: matched.slice(0, limit),
    truncated: Math.max(0, matched.length - limit),
  }
}

export function isKnownBrandPhotoId(id: string): boolean {
  const photoId = id.trim()
  if (!photoId) return false
  return loadBrandAssetCatalog().some((asset) => asset.kind === "photo" && asset.id === photoId)
}

function looksLikeImage(bytes: Buffer): boolean {
  if (bytes.length < 8) return false
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  return bytes.subarray(0, 4).equals(png)
}

export type CoverPhotoFetch =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: string }

/** One photo from the catalogue. The host is allowlisted. Timeout is 10s. */
export async function fetchBrandCoverPhoto(
  coverPhotoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CoverPhotoFetch> {
  const id = coverPhotoId.trim()
  const asset = loadBrandAssetCatalog().find((row) => row.kind === "photo" && row.id === id)
  if (!asset) return { ok: false, reason: "unknown photo id" }
  if (!brandAssetUrlIsAllowed(asset.url)) return { ok: false, reason: "host not allowlisted" }
  try {
    const response = await fetchImpl(asset.url, {
      signal: AbortSignal.timeout(COVER_PHOTO_TIMEOUT_MS),
    })
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!looksLikeImage(bytes)) return { ok: false, reason: "response was not an image" }
    return { ok: true, bytes }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
