import type { MediaContainerBestPractice } from "@/lib/types/publisher"
import { isEmptyBestPractice } from "@/lib/types/bestPractice"

import { slugify } from "./compose"
import {
  channelRows,
  deriveChannelTabs,
  type ChannelFamily,
  type TokenOverrides,
} from "./channelTabs"
import { PICKLISTS, TEMPLATES } from "./templates"
import { validateValue } from "./validate"
import type { TemplateElement } from "./types"

/** Soft cap for targeting/geo naming tokens (Prompt 2). */
export const NAMING_TOKEN_MAX_LEN = 24

export type TokenSourceItem = {
  line_item_id: string
  targeting_raw: string
  geo_raw: string
  /** Enriched context for AVA (optional — thin payloads still work). */
  channel?: string
  publisher?: string
  media_type?: string
  buy_type?: string
  creative_name?: string
  family?: ChannelFamily
  /** Platform template levels → element keys, for the model. */
  element_order?: string[]
  best_practice_notes?: string
  brand?: string
  campaign?: string
}

export type AvaTokenSuggestions = Record<
  string,
  { targeting?: string; geo?: string }
>

const TARGETING_ELEMENT: TemplateElement = { key: "targeting", source: "free" }
const GEO_ELEMENT: TemplateElement = { key: "geo", source: "free" }

/**
 * Common AU geo aliases → PICKLISTS.geo vocabulary.
 * Free short tokens still allowed when no alias matches (open question flagged).
 */
const GEO_ALIASES: Record<string, string> = {
  au: "au",
  australia: "au",
  national: "au",
  nationwide: "au",
  nsw: "nsw",
  new_south_wales: "nsw",
  vic: "vic",
  victoria: "vic",
  qld: "qld",
  queensland: "qld",
  sa: "sa",
  south_australia: "sa",
  wa: "wa",
  western_australia: "wa",
  tas: "tas",
  tasmania: "tas",
  nt: "nt",
  northern_territory: "nt",
  act: "act",
  metro: "metro",
  regional: "regional",
}

const GEO_PICKLIST = new Set(PICKLISTS.geo)

/**
 * Truncate a slug to maxLen on a `_` boundary when possible — never mid-segment.
 */
export function clampNamingToken(
  token: string,
  maxLen: number = NAMING_TOKEN_MAX_LEN,
): string {
  const s = String(token ?? "").trim()
  if (!s) return ""
  if (s.length <= maxLen) return s

  const head = s.slice(0, maxLen)
  const lastUnderscore = head.lastIndexOf("_")
  // Prefer a boundary if we keep a meaningful prefix (≥40% of cap).
  if (lastUnderscore >= Math.floor(maxLen * 0.4)) {
    return head.slice(0, lastUnderscore).replace(/_+$/g, "")
  }
  return head.replace(/_+$/g, "")
}

/** Map known geo phrases onto the controlled geo picklist when possible. */
export function normaliseGeoToken(slug: string): string {
  const key = slugify(slug)
  if (!key) return ""
  if (GEO_PICKLIST.has(key)) return key
  const aliased = GEO_ALIASES[key]
  if (aliased) return aliased
  return key
}

function fallbackSlug(raw: string): string {
  return clampNamingToken(slugify(raw))
}

/**
 * Slugify + validateValue + length-clamp an AVA suggestion.
 * On failure, use clamped slugify(raw). Returns null when both yield empty.
 */
function resolveToken(
  element: TemplateElement,
  suggested: string | undefined,
  raw: string,
  opts?: { geo?: boolean },
): { token: string; fromAva: boolean } | null {
  const finish = (slug: string): string => {
    const clamped = clampNamingToken(slug)
    return opts?.geo ? normaliseGeoToken(clamped) : clamped
  }

  const fallback = finish(slugify(raw))
  if (suggested !== undefined && suggested !== null) {
    const cleaned = finish(slugify(String(suggested)))
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
 * Merge AVA suggestions into TokenOverrides. Every AVA value is re-slugified,
 * length-clamped, and validated; invalid tokens fall back to clamped slugify(raw).
 * Fields with no suggestion are omitted so channelRows uses its default slugify path.
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
        { geo: true },
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

/** Template element-order lines for a naming family / platform. */
export function elementOrderForFamily(family: ChannelFamily | string): string[] {
  const platform = String(family || "").trim()
  if (!platform) return []
  return TEMPLATES.filter((t) => t.platform === platform).map(
    (t) => `${t.level}: ${t.elements.map((el) => el.key).join(" - ")}`,
  )
}

function compactBestPracticeNotes(
  containerKey: string,
  rows?: MediaContainerBestPractice[] | null,
): string {
  if (!rows?.length || !containerKey) return ""
  const match = rows.find(
    (r) =>
      r.is_active !== false &&
      String(r.media_container || "").trim().toLowerCase() ===
        containerKey.trim().toLowerCase(),
  )
  if (!match || isEmptyBestPractice(match.best_practice)) return ""
  const parts: string[] = []
  for (const section of match.best_practice?.sections ?? []) {
    if (section.heading?.trim()) parts.push(section.heading.trim())
    for (const item of section.items ?? []) {
      if (item.trim()) parts.push(item.trim())
    }
  }
  return parts.join("; ").slice(0, 400)
}

export type CollectTokenSourcesOptions = {
  globals?: { brand?: string; campaign?: string }
  containerBestPractice?: MediaContainerBestPractice[] | null
}

/** Collect enriched token sources for syncable naming rows. */
export function collectTokenSources(
  lineItems: Record<string, unknown[]> | null | undefined,
  opts?: CollectTokenSourcesOptions,
): TokenSourceItem[] {
  const tabs = deriveChannelTabs(lineItems)
  const seen = new Set<string>()
  const out: TokenSourceItem[] = []
  const brand = opts?.globals?.brand?.trim() || undefined
  const campaign = opts?.globals?.campaign?.trim() || undefined

  for (const tab of tabs) {
    const { rows } = channelRows(tab, lineItems)
    const notes = compactBestPracticeNotes(
      tab.containerKey,
      opts?.containerBestPractice,
    )
    const element_order = elementOrderForFamily(tab.family)

    for (const row of rows) {
      if (seen.has(row.line_item_id)) continue
      seen.add(row.line_item_id)
      out.push({
        line_item_id: row.line_item_id,
        targeting_raw: row.targeting_raw,
        geo_raw: row.geo_raw,
        channel: row.channelKey,
        publisher: row.publisher,
        media_type: row.media_type,
        buy_type: row.buy_type,
        creative_name: row.creative_name,
        family: row.family,
        element_order,
        best_practice_notes: notes || undefined,
        brand,
        campaign,
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
