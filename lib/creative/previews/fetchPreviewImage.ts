/**
 * Server-side fetch of a platform preview image. The only outbound path for
 * creative preview bytes: the host allowlist, the size cap and the timeout
 * live here, and the app never links to these hosts directly (Meta URLs are
 * signed and expire in about five days). The one exception is a CM360 video
 * file on gcdn.2mdn.net, played in the browser (see dashboard.ts videoUrl).
 */

/** Hostname suffixes. A host must be a subdomain of one of these. */
export const PREVIEW_HOST_SUFFIXES = [
  ".fbcdn.net",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".byteimg.com",
  // CM360 display assets: https://s0.2mdn.net/<advertiser id>/<file name>
  ".2mdn.net",
] as const

export const PREVIEW_MAX_BYTES = 5 * 1024 * 1024
export const PREVIEW_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export type PreviewImage = { bytes: Uint8Array; contentType: string; ext: string }

export type PreviewFetchFailure =
  | "bad_url"
  | "host_not_allowed"
  | "http_error"
  | "not_image"
  | "too_large"
  | "timeout"
  | "too_many_redirects"
  | "network"

export type PreviewFetchResult =
  | { ok: true; image: PreviewImage }
  | { ok: false; reason: PreviewFetchFailure; detail?: string }

export function isAllowedPreviewHost(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  if (url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PREVIEW_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
}

/**
 * TikTok cover URLs arrive as http:// on an allowlisted CDN host. Upgrade an
 * allowlisted http URL to https; anything else is returned unchanged (and the
 * https-only check refuses it).
 */
export function previewFetchUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return raw
  }
  if (url.protocol !== "http:") return url.toString()
  url.protocol = "https:"
  const upgraded = url.toString()
  return isAllowedPreviewHost(upgraded) ? upgraded : raw
}

/** Normalised image content type and file extension, or null when not an allowed image type. */
export function imageTypeFrom(contentType: string | null): { contentType: string; ext: string } | null {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
  const ext = EXT_BY_TYPE[type]
  if (!ext) return null
  return { contentType: type === "image/jpg" ? "image/jpeg" : type, ext }
}

async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export type FetchPreviewOptions = {
  fetchImpl?: typeof fetch
  maxBytes?: number
  timeoutMs?: number
}

export async function fetchPreviewImage(
  sourceUrl: string,
  options: FetchPreviewOptions = {},
): Promise<PreviewFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxBytes = options.maxBytes ?? PREVIEW_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? PREVIEW_TIMEOUT_MS

  try {
    new URL(sourceUrl)
  } catch {
    return { ok: false, reason: "bad_url" }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let current = previewFetchUrl(sourceUrl)
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedPreviewHost(current)) {
        return { ok: false, reason: "host_not_allowed", detail: safeHost(current) }
      }
      const res = await fetchImpl(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "image/*" },
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location")
        if (!location) return { ok: false, reason: "http_error", detail: String(res.status) }
        current = new URL(location, current).toString()
        continue
      }
      if (!res.ok) return { ok: false, reason: "http_error", detail: String(res.status) }

      const type = imageTypeFrom(res.headers.get("content-type"))
      if (!type) return { ok: false, reason: "not_image", detail: res.headers.get("content-type") ?? "" }

      const declared = Number(res.headers.get("content-length"))
      if (Number.isFinite(declared) && declared > maxBytes) {
        return { ok: false, reason: "too_large", detail: String(declared) }
      }
      const bytes = await readCapped(res.body, maxBytes)
      if (!bytes) return { ok: false, reason: "too_large" }
      if (bytes.byteLength === 0) return { ok: false, reason: "http_error", detail: "empty body" }
      return { ok: true, image: { bytes, contentType: type.contentType, ext: type.ext } }
    }
    return { ok: false, reason: "too_many_redirects" }
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: "timeout" }
    return { ok: false, reason: "network", detail: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).hostname
  } catch {
    return ""
  }
}
