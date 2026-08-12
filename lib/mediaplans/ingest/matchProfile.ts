/**
 * Match a detected sheet to a publisher_profiles row via detect_signature only
 * (config), never by hardcoded publisher name.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { sheetIsLineItems } from "@/lib/mediaplans/ingest/publisherProfileConfig"

export type ProfileMatch = {
  profile: PublisherProfileConfig
  confidence: number
  reasons: string[]
}

function headerHaystack(shape: DetectedSheetShape): string {
  return shape.descriptor_columns
    .map((d) => d.header)
    .join("\n")
    .toLowerCase()
}

export function scoreProfileAgainstSheet(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
): ProfileMatch {
  const reasons: string[] = []
  let score = 0
  const sig = profile.detect_signature
  const hay = headerHaystack(shape)

  const includes = Array.isArray(sig.header_text_includes)
    ? (sig.header_text_includes as unknown[]).map((x) => String(x))
    : []
  if (includes.length > 0) {
    let hits = 0
    for (const h of includes) {
      if (hay.includes(h.toLowerCase())) hits++
    }
    const ratio = hits / includes.length
    score += ratio * 0.55
    reasons.push(`header hints ${hits}/${includes.length}`)
  }

  const legendCodes = Array.isArray(sig.legend_codes)
    ? (sig.legend_codes as unknown[]).map((x) => String(x))
    : []
  if (legendCodes.length > 0 && shape.grid_columns.length > 0) {
    const sample = new Set<string>()
    for (const r of shape.data_rows.slice(0, 40)) {
      for (const g of shape.grid_columns.slice(0, 30)) {
        const v = (shape.matrix[r]?.[g.col] ?? "").trim()
        if (v) sample.add(v)
      }
    }
    let hits = 0
    for (const code of legendCodes) {
      if (sample.has(code)) hits++
    }
    if (hits > 0) {
      score += Math.min(0.25, (hits / legendCodes.length) * 0.25)
      reasons.push(`legend codes in grid ${hits}`)
    }
  }

  if (sheetIsLineItems(profile, shape.sheet_name)) {
    score += 0.1
    reasons.push("sheet_rules line_items")
  } else if (profile.sheet_rules.some((r) => r.role === "ignore")) {
    // penalise if this sheet is explicitly ignore
    for (const rule of profile.sheet_rules) {
      const m = rule.match
      if (
        rule.role === "ignore" &&
        "name_includes" in m &&
        shape.sheet_name.includes(m.name_includes)
      ) {
        score *= 0.15
        reasons.push("sheet_rules ignore")
      }
    }
  }

  score += shape.line_item_sheet_confidence * 0.1

  return {
    profile,
    confidence: Math.max(0, Math.min(1, score)),
    reasons,
  }
}

export function pickBestProfile(
  profiles: PublisherProfileConfig[],
  shape: DetectedSheetShape,
): ProfileMatch | null {
  const ranked = profiles
    .filter((p) => p.active)
    .map((p) => scoreProfileAgainstSheet(p, shape))
    .sort((a, b) => b.confidence - a.confidence)
  return ranked[0] ?? null
}
