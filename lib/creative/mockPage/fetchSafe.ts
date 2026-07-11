import "server-only"
import dns from "node:dns/promises"
import net from "node:net"
import { isPrivateOrReservedIp } from "./privateIp"

const FETCH_TIMEOUT_MS = 5_000
const MAX_BYTES = 3 * 1024 * 1024
const MAX_REDIRECTS = 3
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export class MockPageFetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_url"
      | "https_required"
      | "private_ip"
      | "dns_failed"
      | "timeout"
      | "too_large"
      | "not_html"
      | "fetch_failed"
      | "redirect_limit",
  ) {
    super(message)
    this.name = "MockPageFetchError"
  }
}

async function resolveAndAssertPublic(hostname: string): Promise<string[]> {
  let records: Array<{ address: string; family: number }>
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new MockPageFetchError("Could not resolve host", "dns_failed")
  }
  if (!records.length) {
    throw new MockPageFetchError("Could not resolve host", "dns_failed")
  }
  const ips = records.map((r) => r.address)
  for (const ip of ips) {
    if (isPrivateOrReservedIp(ip)) {
      throw new MockPageFetchError("URL resolves to a private or reserved address", "private_ip")
    }
  }
  return ips
}

function assertHttpsUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new MockPageFetchError("Invalid URL", "invalid_url")
  }
  if (parsed.protocol !== "https:") {
    throw new MockPageFetchError("Only https URLs are allowed", "https_required")
  }
  if (!parsed.hostname) {
    throw new MockPageFetchError("Invalid URL", "invalid_url")
  }
  // Block literal IPs that are private before DNS
  if (net.isIP(parsed.hostname) && isPrivateOrReservedIp(parsed.hostname)) {
    throw new MockPageFetchError("URL resolves to a private or reserved address", "private_ip")
  }
  return parsed
}

/**
 * Fetch HTML with SSRF guards: https-only, DNS private-IP reject, manual redirects
 * (re-check each hop), no cookies, 5s timeout, 3MB cap, text/html only.
 */
export async function fetchHtmlSafe(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let current = assertHttpsUrl(rawUrl)
  await resolveAndAssertPublic(current.hostname)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": DESKTOP_UA,
          // Explicitly no Cookie / Authorization
        },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === "AbortError") {
        throw new MockPageFetchError("Timed out fetching page", "timeout")
      }
      throw new MockPageFetchError("Failed to fetch page", "fetch_failed")
    } finally {
      clearTimeout(timer)
    }

    // Redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location")
      if (!location) {
        throw new MockPageFetchError("Redirect missing Location", "fetch_failed")
      }
      if (hop === MAX_REDIRECTS) {
        throw new MockPageFetchError("Too many redirects", "redirect_limit")
      }
      const next = new URL(location, current)
      current = assertHttpsUrl(next.href)
      await resolveAndAssertPublic(current.hostname)
      continue
    }

    if (!response.ok) {
      throw new MockPageFetchError(`Upstream returned ${response.status}`, "fetch_failed")
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase()
    if (!contentType.includes("text/html")) {
      throw new MockPageFetchError("URL did not return HTML", "not_html")
    }

    const contentLength = response.headers.get("content-length")
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      throw new MockPageFetchError("Page exceeds 3MB limit", "too_large")
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new MockPageFetchError("Empty response body", "fetch_failed")
    }

    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_BYTES) {
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
        throw new MockPageFetchError("Page exceeds 3MB limit", "too_large")
      }
      chunks.push(value)
    }

    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8")
    return { html, finalUrl: current.href }
  }

  throw new MockPageFetchError("Too many redirects", "redirect_limit")
}
