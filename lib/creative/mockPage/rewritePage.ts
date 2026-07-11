/**
 * Live-page HTML rewrite + slot detection (cheerio).
 * Import only from server route / mockPage barrel — never from client components.
 */
import * as cheerio from "cheerio"
import type { Element } from "domhandler"

/** IAB display sizes used for slot matching (same set as built-in mock templates). */
export const IAB_SIZES = [
  { width: 300, height: 250 },
  { width: 728, height: 90 },
  { width: 970, height: 250 },
  { width: 300, height: 600 },
  { width: 320, height: 50 },
  { width: 160, height: 600 },
  { width: 336, height: 280 },
  { width: 970, height: 90 },
] as const

export type DetectedSlot = {
  width: number
  height: number
  matched: boolean
  source: "gpt" | "size" | "class"
}

export type CreativeInject = {
  id: number
  mime_type: string
  width_px: number
  height_px: number
  asset_name: string
}

export type RewriteResult = {
  html: string
  slots: DetectedSlot[]
}

const AD_CLASS_ID_RE = /(^|[-_])(ad|advert|ads|mrec|leaderboard|billboard|banner)([-_]|$)/i

const ON_ATTR_RE = /^on/i

function parsePx(value: string | undefined | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d+(?:\.\d+)?)(px)?$/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function parseStyleDimension(style: string | undefined, prop: "width" | "height"): number | null {
  if (!style) return null
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i")
  const m = style.match(re)
  return m ? parsePx(m[1]) : null
}

function nearestIabSize(width: number, height: number): { width: number; height: number } | null {
  for (const size of IAB_SIZES) {
    if (size.width === width && size.height === height) return size
  }
  // Allow small tolerance (±2px) for CSS rounding
  for (const size of IAB_SIZES) {
    if (Math.abs(size.width - width) <= 2 && Math.abs(size.height - height) <= 2) {
      return { width: size.width, height: size.height }
    }
  }
  return null
}

function readElementSize($: cheerio.CheerioAPI, el: Element): { width: number; height: number } | null {
  const attribs = el.attribs || {}
  const style = attribs.style
  let width =
    parsePx(attribs.width) ??
    parseStyleDimension(style, "width") ??
    parsePx(attribs["data-width"]) ??
    parsePx(attribs["data-ad-width"])
  let height =
    parsePx(attribs.height) ??
    parseStyleDimension(style, "height") ??
    parsePx(attribs["data-height"]) ??
    parsePx(attribs["data-ad-height"])

  // GPT often encodes size in id: div-gpt-ad-...-300x250
  const id = attribs.id || ""
  const idSize = id.match(/(\d{2,4})x(\d{2,4})/i)
  if (idSize) {
    width = width ?? Number(idSize[1])
    height = height ?? Number(idSize[2])
  }

  const dataSlot = attribs["data-ad-slot"] || attribs["data-adslot"] || ""
  const slotSize = String(dataSlot).match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/i)
  if (slotSize) {
    width = width ?? Number(slotSize[1])
    height = height ?? Number(slotSize[2])
  }

  if (width == null || height == null) return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width < 50 || height < 30 || width > 2000 || height > 2000) return null
  return { width, height }
}

function creativeInnerHtml(creative: CreativeInject, width: number, height: number): string {
  const download = `/api/creative-assets/${creative.id}/download`
  const preview = `/api/creative-assets/${creative.id}/preview/`
  const name = escapeAttr(creative.asset_name || "Creative")

  if (creative.mime_type === "application/zip") {
    // Nested iframe: own sandbox allow-scripts. Outer shell stays scriptless;
    // parent iframe uses allow-same-origin only so this nested frame can load.
    // Note: some browsers intersect sandbox flags with ancestors — client may
    // overlay HTML5 creatives outside the shell when needed.
    return `<iframe title="${name}" src="${preview}" width="${width}" height="${height}" sandbox="allow-scripts" style="border:0;display:block;width:${width}px;height:${height}px;max-width:100%;"></iframe>`
  }
  if (creative.mime_type.startsWith("video/")) {
    return `<video src="${download}" width="${width}" height="${height}" muted autoplay loop playsinline style="display:block;width:100%;height:100%;object-fit:contain;background:#000;"></video>`
  }
  if (creative.mime_type.startsWith("image/")) {
    return `<img src="${download}" alt="${name}" width="${width}" height="${height}" style="display:block;width:100%;height:100%;object-fit:contain;" />`
  }
  return ""
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function placeholderHtml(
  width: number,
  height: number,
  creative: CreativeInject | null,
): { html: string; matched: boolean } {
  const matches =
    !!creative && creative.width_px === width && creative.height_px === height
  const inner =
    matches && creative ? creativeInnerHtml(creative, width, height) : ""
  return {
    matched: matches,
    html: `<div data-av-slot="${width}x${height}" style="width:${width}px;height:${height}px;max-width:100%;margin:0 auto;overflow:hidden;box-sizing:border-box;">${inner}</div>`,
  }
}

function stripDangerous($: cheerio.CheerioAPI) {
  $("script, noscript").remove()
  $("meta[http-equiv]").each((_, el) => {
    const httpEquiv = ($(el).attr("http-equiv") || "").toLowerCase()
    if (httpEquiv === "content-security-policy") {
      $(el).remove()
    }
  })

  $("*").each((_, el) => {
    if (el.type !== "tag") return
    const attribs = el.attribs
    if (!attribs) return
    for (const name of Object.keys(attribs)) {
      if (ON_ATTR_RE.test(name)) {
        $(el).removeAttr(name)
      }
      // javascript: URLs
      const val = attribs[name]
      if (typeof val === "string" && /^\s*javascript:/i.test(val)) {
        $(el).removeAttr(name)
      }
    }
  })
}

function ensureBaseHref($: cheerio.CheerioAPI, baseUrl: string) {
  const head = $("head")
  if (head.length === 0) {
    $("html").prepend(`<head><base href="${escapeAttr(baseUrl)}" /></head>`)
    return
  }
  if ($("base").length === 0) {
    head.prepend(`<base href="${escapeAttr(baseUrl)}" />`)
  } else {
    $("base").first().attr("href", baseUrl)
  }
}

type Candidate = {
  el: Element
  width: number
  height: number
  source: DetectedSlot["source"]
}

function collectCandidates($: cheerio.CheerioAPI): Candidate[] {
  const found: Candidate[] = []
  const seen = new Set<Element>()

  const push = (el: Element, width: number, height: number, source: DetectedSlot["source"]) => {
    const iab = nearestIabSize(width, height)
    if (!iab) return
    if (seen.has(el)) return
    // Skip if an ancestor is already a candidate (prefer outer GPT containers)
    let parent: typeof el.parent | null = el.parent ?? null
    while (parent) {
      if (parent.type === "tag" && seen.has(parent as Element)) return
      parent = parent.parent ?? null
    }
    seen.add(el)
    found.push({ el, width: iab.width, height: iab.height, source })
  }

  // (a) GPT slots
  $(
    'div[id^="div-gpt-ad"], [data-ad-slot], [data-adslot], [data-google-query-id], ins.adsbygoogle',
  ).each((_, el) => {
    if (el.type !== "tag") return
    const size = readElementSize($, el)
    if (size) push(el, size.width, size.height, "gpt")
  })

  // (b) iframes/divs with IAB dimensions
  $("iframe, div, aside, section").each((_, el) => {
    if (el.type !== "tag") return
    if (seen.has(el)) return
    const size = readElementSize($, el)
    if (!size) return
    if (!nearestIabSize(size.width, size.height)) return
    push(el, size.width, size.height, "size")
  })

  // (c) ad-ish class/id + plausible dimensions
  $("div, aside, section, span").each((_, el) => {
    if (el.type !== "tag") return
    if (seen.has(el)) return
    const id = el.attribs?.id || ""
    const className = el.attribs?.class || ""
    if (!AD_CLASS_ID_RE.test(id) && !AD_CLASS_ID_RE.test(className)) return
    const size = readElementSize($, el)
    if (!size) return
    if (!nearestIabSize(size.width, size.height)) return
    push(el, size.width, size.height, "class")
  })

  return found
}

/**
 * Rewrite fetched HTML into a scriptless visual shell with data-av-slot placeholders.
 * Matching creatives are inlined (image/video) or nested-iframe (HTML5 zip).
 */
export function rewriteMockPage(
  html: string,
  baseUrl: string,
  creative: CreativeInject | null,
): RewriteResult {
  const $ = cheerio.load(html)

  stripDangerous($)
  ensureBaseHref($, baseUrl)

  const candidates = collectCandidates($)
  const slots: DetectedSlot[] = []

  for (const candidate of candidates) {
    const { html: ph, matched } = placeholderHtml(
      candidate.width,
      candidate.height,
      creative,
    )
    $(candidate.el).replaceWith(ph)
    slots.push({
      width: candidate.width,
      height: candidate.height,
      matched,
      source: candidate.source,
    })
  }

  // Final pass: strip any scripts that replacement might have introduced (none expected)
  stripDangerous($)

  return { html: $.html(), slots }
}

export function summarizeSlots(
  slots: DetectedSlot[],
  creative: CreativeInject | null,
): {
  matchedCounts: Record<string, number>
  emptyCounts: Record<string, number>
  total: number
  matchedTotal: number
  emptyTotal: number
  creativeSize: string | null
} {
  const matchedCounts: Record<string, number> = {}
  const emptyCounts: Record<string, number> = {}
  let matchedTotal = 0
  let emptyTotal = 0

  for (const slot of slots) {
    const key = `${slot.width}x${slot.height}`
    if (slot.matched) {
      matchedCounts[key] = (matchedCounts[key] || 0) + 1
      matchedTotal++
    } else {
      emptyCounts[key] = (emptyCounts[key] || 0) + 1
      emptyTotal++
    }
  }

  return {
    matchedCounts,
    emptyCounts,
    total: slots.length,
    matchedTotal,
    emptyTotal,
    creativeSize:
      creative && creative.width_px && creative.height_px
        ? `${creative.width_px}x${creative.height_px}`
        : null,
  }
}
