import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"

function pick(...values: unknown[]): string {
  for (const v of values) {
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ""
}

function uniqueParts(parts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/**
 * Channel-aware identifying segments for MBA scope display names.
 * Prefer real descriptors (network/station/format/placement/publisher/site) over billing ids.
 */
export function mbaBillingScopeLineDescriptorParts(
  mediaType: string,
  lineItem: unknown
): string[] {
  const row = (lineItem ?? {}) as Record<string, unknown>
  const { header1, header2 } = getScheduleHeaders(mediaType, row)

  switch (mediaType) {
    case "ooh":
    case "progOoh":
      return uniqueParts([
        pick(row.network, row.publisher, row.platform, header1),
        pick(row.market, row.placement, row.location),
        pick(row.format, row.oohFormat, row.ooh_format, header2),
      ])
    case "television":
    case "radio":
    case "cinema":
      return uniqueParts([
        header1,
        header2,
        pick(row.format, row.placement, row.daypart, row.creative),
      ])
    case "newspaper":
    case "magazines":
      return uniqueParts([header1, header2, pick(row.format, row.section, row.placement)])
    case "digiDisplay":
    case "digiAudio":
    case "digiVideo":
    case "bvod":
      return uniqueParts([header1, header2, pick(row.format, row.placement, row.creative)])
    case "search":
    case "socialMedia":
    case "progDisplay":
    case "progVideo":
    case "progBvod":
    case "progAudio":
      return uniqueParts([
        header1,
        header2,
        pick(row.campaignName, row.placement, row.format, row.site),
      ])
    case "influencers":
    case "contentCreator":
      return uniqueParts([
        pick(row.creator, row.influencer, row.publisher, row.network, header1),
        pick(row.platform, row.placement, header2),
        pick(row.format, row.contentType, row.content_type),
      ])
    default:
      return uniqueParts([
        header1,
        header2,
        pick(row.format, row.placement, row.site, row.market),
      ])
  }
}

/**
 * Human label for an MBA scope line. Never returns a billing id.
 * Fallback: "{mediaLabel} line {n}".
 */
export function buildMbaBillingScopeLineLabel(opts: {
  mediaType: string
  mediaLabel: string
  lineItem: unknown
  /** 1-based index within the container (or plan) for the fallback. */
  lineNumber: number
}): { title: string; subtitle?: string } {
  const parts = mbaBillingScopeLineDescriptorParts(opts.mediaType, opts.lineItem)
  const mediaLabel = String(opts.mediaLabel || opts.mediaType || "Media").trim() || "Media"
  const title =
    parts.length > 0 ? parts.join(" — ") : `${mediaLabel} line ${opts.lineNumber}`

  const row = (opts.lineItem ?? {}) as Record<string, unknown>
  const buyType = pick(row.buy_type, row.buyType)
  const extra = pick(row.campaignName, row.creative, row.description)
  const titleLower = title.toLowerCase()
  const subtitleCandidate = [buyType, extra].find(
    (s) => s && !titleLower.includes(s.toLowerCase())
  )

  return {
    title,
    subtitle: subtitleCandidate || undefined,
  }
}
