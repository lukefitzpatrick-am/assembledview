import { createHash } from "node:crypto"

/**
 * Query parameters that change when Meta or TikTok re-sign the same image.
 * Meta: oe (expiry), oh (signature), ccb, stp and every _nc_* edge/cache hint.
 * TikTok: x-expires, x-signature and the per-request nonce/policy/log params,
 * plus the per-sync refresh_token, t, ps, shp, shcp, idc and dr parameters on
 * video cover URLs. VideoID and the path stay, so a cover keeps one identity.
 */
const VOLATILE_PARAMS = new Set([
  "oe",
  "oh",
  "ccb",
  "stp",
  "x-expires",
  "x-signature",
  "x-orig-expires",
  "x-orig-sign",
  "policy",
  "nonce",
  "l",
  "refresh_token",
  "t",
  "ps",
  "shp",
  "shcp",
  "idc",
  "dr",
])

function isVolatileParam(name: string): boolean {
  const key = name.toLowerCase()
  return key.startsWith("_nc_") || VOLATILE_PARAMS.has(key)
}

/**
 * Stable identity of a preview image URL: path plus the remaining query
 * parameters, sorted. The host is dropped because the CDN edge
 * (scontent-syd2-1.xx.fbcdn.net vs scontent.xx.fbcdn.net) changes on re-sign.
 * Returns null for a value that is not an absolute http(s) URL.
 */
export function canonicalPreviewUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isVolatileParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  const query = new URLSearchParams(kept).toString()
  return query ? `${url.pathname}?${query}` : url.pathname
}

/** sha256 hex of `canonicalPreviewUrl`; null when the URL does not parse. */
export function previewSourceHash(raw: string): string | null {
  const canonical = canonicalPreviewUrl(raw)
  if (canonical == null) return null
  return createHash("sha256").update(canonical).digest("hex")
}
