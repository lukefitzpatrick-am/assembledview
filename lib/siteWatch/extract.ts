/**
 * Fields Site Watch keeps per page (brief 5.3), from server HTML only.
 * Port of watch.py `extract` and `layout_skeleton`.
 */
import { createHash } from "node:crypto"

import * as cheerio from "cheerio"

import { findTrackingIds, type TrackingKind } from "./patterns"

export type PageFields = {
  status: number
  final_url: string
  title: string
  meta_description: string
  canonical: string
  robots_meta: string
  x_robots: string
  h1: string[]
  hreflang: string[]
  og_title: string
  og_image: string
  schema_types: string[]
  tracking: Partial<Record<TrackingKind, string[]>>
  script_hosts: string[]
  /** Stylesheet URL (no query) to content hash; empty when visual watch is off. */
  stylesheets: Record<string, string>
  inline_css: string
  images: string[]
}

export type PageSnapshot = { fields: PageFields; text: string; layout: string[] }

export type ExtractInput = {
  html: string
  status: number
  finalUrl: string
  xRobotsTag: string
  ignoreSelectors: readonly string[]
}

/** The parts of a parsed node read here (domhandler shape, not a direct dependency). */
type DomNode = { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: DomNode[] }

const STRUCTURAL = new Set([
  "header", "nav", "main", "section", "article", "aside", "footer", "form",
  "h1", "h2", "h3", "video", "iframe", "table", "dialog",
])
/** Generated class names: three or more digits, or a hex run of six or more with a digit (not `facade`). */
const GENERATED_CLASS = /\d{3,}|(?=[a-f0-9]*\d)[a-f0-9]{6,}/

export function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12)
}

export function stripQuery(url: string): string {
  return url.split("#")[0]!.split("?")[0]!
}

function absolute(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function layoutOutline($: cheerio.CheerioAPI): string[] {
  const lines: string[] = []
  const walk = (el: DomNode, depth: number) => {
    for (const child of el.children ?? []) {
      if (child.type !== "tag") continue
      let d = depth
      const name = child.name ?? ""
      const id = child.attribs?.id
      if (STRUCTURAL.has(name) || id) {
        const classes = (child.attribs?.class ?? "")
          .split(/\s+/)
          .filter((c) => c && !GENERATED_CLASS.test(c))
          .slice(0, 4)
        lines.push("  ".repeat(depth) + name + (id ? `#${id}` : "") + classes.map((c) => `.${c}`).join(""))
        d++
      }
      walk(child, d)
    }
  }
  const body = $("body").get(0) as DomNode | undefined
  if (body) walk(body, 0)
  return lines
}

function textLines(nodes: readonly DomNode[], out: string[]): void {
  for (const n of nodes) {
    if (n.type === "text") {
      for (const l of (n.data ?? "").split("\n")) {
        const t = l.trim()
        if (t) out.push(t)
      }
    } else if (n.children) {
      textLines(n.children, out)
    }
  }
}

/**
 * Extract a page. Stylesheet hashes are not fetched here: `stylesheetUrls`
 * lists them (absolute, with query) for the caller, and `fields.stylesheets`
 * is left empty for it to fill.
 */
export function extractPage(input: ExtractInput): PageSnapshot & { stylesheetUrls: string[] } {
  const { html, finalUrl } = input
  const $ = cheerio.load(html)
  const meta = (attr: "name" | "property", value: string) =>
    ($(`meta[${attr}="${value}" i]`).first().attr("content") ?? "").trim()
  let ownHost = ""
  try {
    ownHost = new URL(finalUrl).host
  } catch {
    // keep "" so every script host counts as third party
  }

  const scriptHosts = new Set<string>()
  $("script[src]").each((_, el) => {
    const u = absolute($(el).attr("src") ?? "", finalUrl)
    const host = u ? new URL(u).host : ""
    if (host && host !== ownHost) scriptHosts.add(host)
  })
  const schemaTypes = new Set<string>()
  $('script[type="application/ld+json"]').each((_, el) => {
    // "@type": "A" or "@type": ["A", "B"]
    for (const m of $(el).text().matchAll(/"@type"\s*:\s*("[^"]+"|\[[^\]]*\])/g)) {
      for (const t of m[1]!.matchAll(/"([^"]+)"/g)) schemaTypes.add(t[1]!)
    }
  })
  const stylesheetUrls = [
    ...new Set(
      $('link[rel~="stylesheet"][href]')
        .map((_, el) => absolute($(el).attr("href") ?? "", finalUrl))
        .get()
        .filter((u): u is string => !!u),
    ),
  ]
  const inlineCss = shortHash($("style").map((_, el) => $(el).text()).get().join(""))

  for (const sel of input.ignoreSelectors) {
    try {
      $(sel).remove()
    } catch {
      // an invalid selector from settings is skipped, not fatal
    }
  }
  const images = [
    ...new Set(
      $("img[src]")
        .map((_, el) => $(el).attr("src") ?? "")
        .get()
        .filter((src) => !src.startsWith("data:"))
        .map((src) => absolute(src, finalUrl))
        .filter((u): u is string => !!u)
        .map(stripQuery),
    ),
  ].sort()
  const layout = layoutOutline($)

  const fields: PageFields = {
    status: input.status,
    final_url: finalUrl,
    title: $("title").first().text().trim(),
    meta_description: meta("name", "description"),
    canonical: ($('link[rel~="canonical"]').first().attr("href") ?? "").trim(),
    // Any case of the name, and the googlebot tag too: both can noindex a page.
    robots_meta: $('meta[name="robots" i], meta[name="googlebot" i]')
      .map((_, el) => ($(el).attr("content") ?? "").trim())
      .get()
      .filter(Boolean)
      .join(", "),
    x_robots: input.xRobotsTag,
    h1: $("h1").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get(),
    hreflang: $("link[hreflang]")
      .map((_, el) => `${$(el).attr("hreflang")}=${$(el).attr("href") ?? ""}`)
      .get()
      .sort(),
    og_title: meta("property", "og:title"),
    og_image: meta("property", "og:image"),
    schema_types: [...schemaTypes].sort(),
    tracking: findTrackingIds(html),
    script_hosts: [...scriptHosts].sort(),
    stylesheets: {},
    inline_css: inlineCss,
    images,
  }

  $("head, script, style, noscript, svg, template").remove()
  const lines: string[] = []
  textLines([$.root().get(0) as DomNode], lines)
  return { fields, text: lines.join("\n"), layout, stylesheetUrls }
}
