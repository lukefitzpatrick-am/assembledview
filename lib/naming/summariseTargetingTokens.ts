import { slugify } from "./compose"
import {
  channelRows,
  deriveChannelTabs,
  type TokenOverrides,
} from "./channelTabs"
import { validateValue } from "./validate"
import type { TemplateElement } from "./types"

export type TokenSourceItem = {
  line_item_id: string
  targeting_raw: string
  geo_raw: string
}

export type AvaTokenSuggestions = Record<
  string,
  { targeting?: string; geo?: string }
>

const TARGETING_ELEMENT: TemplateElement = { key: "targeting", source: "free" }
const GEO_ELEMENT: TemplateElement = { key: "geo", source: "free" }

function fallbackSlug(raw: string): string {
  return slugify(raw)
}

/**
 * Slugify + validateValue an AVA suggestion. On failure, use slugify(raw).
 * Returns undefined when both suggestion and raw yield empty.
 */
function resolveToken(
  element: TemplateElement,
  suggested: string | undefined,
  raw: string,
): { token: string; fromAva: boolean } | null {
  const fallback = fallbackSlug(raw)
  if (suggested !== undefined && suggested !== null) {
    const cleaned = slugify(String(suggested))
    if (cleaned && validateValue(element, cleaned).ok) {
      return { token: cleaned, fromAva: true }
    }
  }
  if (!fallback) return null
  // Fallback slug — only emit when we attempted an AVA value for this field
  if (suggested !== undefined && suggested !== null) {
    return { token: fallback, fromAva: false }
  }
  return null
}

/**
 * Merge AVA suggestions into TokenOverrides. Every AVA value is re-slugified;
 * invalid tokens fall back to slugify(raw). Fields with no suggestion are omitted
 * so channelRows uses its default slugify path.
 */
export function sanitiseTokenOverrides(
  sources: TokenSourceItem[],
  suggestions?: AvaTokenSuggestions | null,
): TokenOverrides {
  return applyAvaSuggestions(sources, suggestions).overrides
}

export function applyAvaSuggestions(
  sources: TokenSourceItem[],
  suggestions?: AvaTokenSuggestions | null,
): { overrides: TokenOverrides; appliedCount: number } {
  const overrides: TokenOverrides = {}
  let appliedCount = 0
  if (!suggestions) return { overrides, appliedCount }

  for (const source of sources) {
    const suggestion = suggestions[source.line_item_id]
    if (!suggestion) continue

    const entry: { targeting?: string; geo?: string } = {}

    if ("targeting" in suggestion) {
      const resolved = resolveToken(
        TARGETING_ELEMENT,
        suggestion.targeting,
        source.targeting_raw,
      )
      if (resolved) {
        entry.targeting = resolved.token
        if (resolved.fromAva) appliedCount += 1
      }
    }

    if ("geo" in suggestion) {
      const resolved = resolveToken(
        GEO_ELEMENT,
        suggestion.geo,
        source.geo_raw,
      )
      if (resolved) {
        entry.geo = resolved.token
        if (resolved.fromAva) appliedCount += 1
      }
    }

    if (entry.targeting !== undefined || entry.geo !== undefined) {
      overrides[source.line_item_id] = entry
    }
  }

  return { overrides, appliedCount }
}

export type SummariseTargetingTokensResult = {
  overrides: TokenOverrides
  appliedCount: number
  usedAva: boolean
  error?: string
}

export type SummariseTargetingTokensOptions = {
  /** Optional AVA provider. Errors are swallowed — caller keeps slugify path. */
  suggest?: (sources: TokenSourceItem[]) => Promise<AvaTokenSuggestions>
}

/**
 * Prefill targeting/geo token overrides. Never throws for AVA failures.
 * Without a working suggest(), returns empty overrides (download uses slugify).
 */
export async function summariseTargetingTokens(
  sources: TokenSourceItem[],
  opts?: SummariseTargetingTokensOptions,
): Promise<SummariseTargetingTokensResult> {
  if (!opts?.suggest || sources.length === 0) {
    return { overrides: {}, appliedCount: 0, usedAva: false }
  }

  try {
    const suggestions = await opts.suggest(sources)
    const { overrides, appliedCount } = applyAvaSuggestions(sources, suggestions)
    return { overrides, appliedCount, usedAva: true }
  } catch (err) {
    return {
      overrides: {},
      appliedCount: 0,
      usedAva: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Collect targeting_raw / geo_raw for syncable naming rows (Prompt 1 channels). */
export function collectTokenSources(
  lineItems: Record<string, unknown[]> | null | undefined,
): TokenSourceItem[] {
  const tabs = deriveChannelTabs(lineItems)
  const seen = new Set<string>()
  const out: TokenSourceItem[] = []

  for (const tab of tabs) {
    const { rows } = channelRows(tab, lineItems)
    for (const row of rows) {
      if (seen.has(row.line_item_id)) continue
      seen.add(row.line_item_id)
      out.push({
        line_item_id: row.line_item_id,
        targeting_raw: row.targeting_raw,
        geo_raw: row.geo_raw,
      })
    }
  }

  return out
}

/**
 * Normalize create/edit item bags (`digiDisplay` etc.) onto MBA `digital*` keys
 * expected by deriveChannelTabs / buildNamingWorkbook.
 */
export function normalizeNamingLineItems(
  items: Record<string, unknown[] | undefined>,
): Record<string, unknown[]> {
  const pick = (...keys: string[]): unknown[] => {
    for (const key of keys) {
      const v = items[key]
      if (Array.isArray(v) && v.length > 0) return v
    }
    for (const key of keys) {
      const v = items[key]
      if (Array.isArray(v)) return v
    }
    return []
  }

  return {
    search: pick("search"),
    socialMedia: pick("socialMedia"),
    digitalAudio: pick("digitalAudio", "digiAudio"),
    digitalDisplay: pick("digitalDisplay", "digiDisplay"),
    digitalVideo: pick("digitalVideo", "digiVideo"),
    bvod: pick("bvod"),
    integration: pick("integration"),
    progDisplay: pick("progDisplay"),
    progVideo: pick("progVideo"),
    progBvod: pick("progBvod"),
    progAudio: pick("progAudio"),
    progOoh: pick("progOoh"),
  }
}
