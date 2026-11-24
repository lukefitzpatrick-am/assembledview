/** Plain HTTP fetch for Site Watch (brief 5.2): browser-like agent, 30 second timeout, no browser. */
const SITE_WATCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 AssembledSiteWatch/1.0"

/** Bodies over this are cut; a page this big is not a marketing page. */
const MAX_BODY_BYTES = 5_000_000
/** Only these content types are read; a PDF or image in a sitemap gets an empty body. */
const TEXT_TYPE = /^(text\/|application\/(xhtml\+xml|xml|rss\+xml|atom\+xml|json|ld\+json|javascript)|$)/i

export type Fetched =
  | { ok: true; status: number; finalUrl: string; headers: Headers; body: string }
  | { ok: false; error: string }

export type FetchUrl = (url: string) => Promise<Fetched>

/**
 * Refuses loopback, private and link-local destinations written as a host
 * name or literal IP. shortcut: a public name that resolves to a private IP
 * is not caught; upgrade to a DNS check if sites stop being a hand list.
 */
export function isPublicUrl(url: string): boolean {
  let host: string
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  } catch {
    return false
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || (!host.includes(".") && !host.includes(":"))) return false
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false
  if (host.includes(":") && /^(::1?$|f[cd]|fe80:|::ffff:)/.test(host)) return false
  return true
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BODY_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => {})
  // Postgres text cannot hold NUL.
  return Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES).toString("utf8").replace(/\0/g, "")
}

export const fetchUrl: FetchUrl = async (url) => {
  if (!isPublicUrl(url)) return { ok: false, error: "refused: not a public address" }
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": SITE_WATCH_USER_AGENT, "accept-language": "en-AU,en;q=0.9" },
    })
    const finalUrl = res.url || url
    if (!isPublicUrl(finalUrl)) {
      await res.body?.cancel().catch(() => {})
      return { ok: false, error: "refused: redirected to a non-public address" }
    }
    const textual = TEXT_TYPE.test(res.headers.get("content-type") ?? "")
    const body = textual ? await readCapped(res) : (await res.body?.cancel().catch(() => {}), "")
    return { ok: true, status: res.status, finalUrl, headers: res.headers, body }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } }
    return { ok: false, error: (e.name === "TimeoutError" ? "timed out after 30s" : e.cause?.code ?? e.message).slice(0, 200) }
  }
}

/** True for an HTML page (or a response with no content type). */
export function isHtml(f: Fetched): boolean {
  return f.ok && /^(text\/html|application\/xhtml\+xml|$)/i.test(f.headers.get("content-type") ?? "")
}

/**
 * Bot protection, not a real page: a 401/403/429/503 with a challenge
 * signal (Cloudflare `cf-mitigated`, a DataDome header, or a challenge page
 * body). An edge header alone is not enough: a real origin outage behind
 * Cloudflare must still raise its change. Such pages keep their snapshot.
 */
export function looksBlocked(f: Fetched): boolean {
  if (!f.ok || ![401, 403, 429, 503].includes(f.status)) return false
  return (
    /challenge/i.test(f.headers.get("cf-mitigated") ?? "") ||
    f.headers.has("x-datadome") ||
    /cf-chl|challenge-platform|just a moment\.\.\.|attention required! \| cloudflare|captcha-delivery|_incapsula_resource|access denied.{0,200}reference #/is.test(f.body.slice(0, 20_000))
  )
}
