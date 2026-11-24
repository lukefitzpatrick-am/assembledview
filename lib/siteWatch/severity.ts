/**
 * Severity rules (Site Watch brief 5.4). One file, so they can be tuned.
 * Critical: noindex added, robots.txt gains `Disallow: /`, a key page
 * returns 4xx/5xx or fails to load, a GTM container leaves a page, the
 * canonical points to another host. High: a tracking ID removed or swapped,
 * the title or H1 of a key page, the redirect target. Medium: other
 * technical fields, key page copy, sitemap and script hosts. Low: visual
 * signals and copy on other pages.
 */
import type { DetectedChange } from "./compare"

export type Severity = "critical" | "high" | "medium" | "low"

export type SeverityContext = { isKeyPage: boolean }

const has = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v)

function hostOf(url: unknown, base: string): string | null {
  if (typeof url !== "string" || !url) return null
  try {
    return new URL(url, base).host
  } catch {
    return null
  }
}

export function severityFor(c: DetectedChange, ctx: SeverityContext): Severity {
  if (c.category === "visual") return "low"
  if (c.field === "page_text") return ctx.isKeyPage ? "medium" : "low"
  if (c.field.startsWith("tracking:")) {
    const before = (c.before as string[] | undefined) ?? []
    const after = new Set((c.after as string[] | undefined) ?? [])
    const removed = before.some((id) => !after.has(id))
    if (removed && c.field === "tracking:gtm") return "critical"
    return removed ? "high" : "medium"
  }
  switch (c.field) {
    case "robots_meta":
    case "x_robots":
      return has(c.after, /noindex/i) && !has(c.before, /noindex/i) ? "critical" : "medium"
    case "robots_txt":
      return (c.diff?.lines ?? []).some((l) => /^\+ disallow:\s*\/\s*$/i.test(l)) ? "critical" : "medium"
    case "status":
      if (typeof c.after === "number" && c.after >= 400) return ctx.isKeyPage ? "critical" : "medium"
      return "low"
    case "page_failed":
      return ctx.isKeyPage ? "critical" : "medium"
    case "page_recovered":
      return "low"
    case "canonical": {
      const page = c.url
      if (!page) return "medium"
      const after = hostOf(c.after, page)
      return after && after !== hostOf(c.before, page) && after !== hostOf(page, page) ? "critical" : "medium"
    }
    case "title":
    case "h1":
      return ctx.isKeyPage ? "high" : "medium"
    case "final_url":
      return "high"
    default:
      return "medium"
  }
}
