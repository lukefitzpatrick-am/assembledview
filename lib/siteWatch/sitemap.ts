/** robots.txt and sitemap reading (brief 5.2 steps 1 and 2). */
import * as cheerio from "cheerio"

import type { FetchUrl } from "./fetchPage"

/** `Sitemap:` lines in robots.txt. */
export function robotsSitemaps(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!)
}

export function parseSitemapXml(xml: string): { index: boolean; locs: string[] } {
  const $ = cheerio.load(xml, { xml: true })
  return {
    index: $("sitemapindex").length > 0,
    locs: $("loc").map((_, el) => $(el).text().trim()).get().filter(Boolean),
  }
}

/** The host without `www.`, so www and apex count as one site. */
function siteHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

const MAX_URLS = 5000
const MAX_FILES = 50
/** One fetch can take its full 30 s timeout. */
const FETCH_BUDGET_MS = 30_000

export type SitemapLimits = { deadline: number; now: () => number }

/**
 * Every page URL in a sitemap, following index files two levels down.
 * Null when the top file could not be read, or time ran out (a partial read
 * would look like removed URLs). A nested file that fails is skipped, and a
 * nested file on another site is never fetched.
 */
export async function readSitemap(url: string, fetchUrl: FetchUrl, limits: SitemapLimits): Promise<string[] | null> {
  const home = siteHost(url)
  const urls: string[] = []
  let files = 0
  let outOfTime = false
  const read = async (u: string, depth: number): Promise<boolean> => {
    if (files++ >= MAX_FILES || urls.length >= MAX_URLS) return true
    if (limits.now() + FETCH_BUDGET_MS > limits.deadline) {
      outOfTime = true
      return false
    }
    const f = await fetchUrl(u)
    if (!f.ok || f.status !== 200) return false
    const { index, locs } = parseSitemapXml(f.body)
    if (!index) {
      urls.push(...locs.slice(0, MAX_URLS - urls.length))
      return true
    }
    if (depth < 2) for (const loc of locs) if (siteHost(loc) === home) await read(loc, depth + 1)
    return true
  }
  const ok = await read(url, 0)
  return ok && !outOfTime ? [...new Set(urls)] : null
}
