/**
 * Single source of truth for media-type chart colors and labels.
 * Colours mirror `mediaTypeTheme.colors` in `lib/utils`.
 */

import { mediaTypeTheme } from "@/lib/utils"

const channelColors = mediaTypeTheme.colors

/** Tableau 10–style ramp for non–media-type series (deterministic fallbacks, ranked charts). */
const TABLEAU_10 = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
  "#499894",
  "#79706E",
] as const

export const MEDIA_TYPE_REGISTRY = {
  television: { label: "Television", color: channelColors.television },
  radio: { label: "Radio", color: channelColors.radio },
  newspaper: { label: "Newspaper", color: channelColors.newspaper },
  magazines: { label: "Magazines", color: channelColors.magazines },
  ooh: { label: "OOH", color: channelColors.ooh },
  cinema: { label: "Cinema", color: channelColors.cinema },
  digital_display: { label: "Digital Display", color: channelColors.digidisplay },
  digital_audio: { label: "Digital Audio", color: channelColors.digiaudio },
  digital_video: { label: "Digital Video", color: channelColors.digivideo },
  bvod: { label: "BVOD", color: channelColors.bvod },
  integration: { label: "Integration", color: channelColors.integration },
  search: { label: "Search", color: channelColors.search },
  social_media: { label: "Social Media", color: channelColors.socialmedia },
  prog_display: { label: "Programmatic Display", color: channelColors.progdisplay },
  prog_video: { label: "Programmatic Video", color: channelColors.progvideo },
  prog_bvod: { label: "Programmatic BVOD", color: channelColors.progbvod },
  prog_audio: { label: "Programmatic Audio", color: channelColors.progaudio },
  prog_ooh: { label: "Programmatic OOH", color: channelColors.progooh },
  influencers: { label: "Influencers", color: channelColors.influencers },
  production: { label: "Production", color: channelColors.production },
} as const

export type MediaTypeRegistryKey = keyof typeof MEDIA_TYPE_REGISTRY

/** Twelve distinct colours for non-registry entities (Tableau 10). */
export const FALLBACK_PALETTE: readonly string[] = [...TABLEAU_10]

/**
 * Theme / DB compact keys and common synonyms → canonical `MEDIA_TYPE_REGISTRY` keys.
 */
const REGISTRY_KEY_ALIASES: Record<string, MediaTypeRegistryKey> = {
  // `mediaTypeTheme.colors` keys
  digidisplay: "digital_display",
  digiaudio: "digital_audio",
  digivideo: "digital_video",
  socialmedia: "social_media",
  progdisplay: "prog_display",
  progvideo: "prog_video",
  progbvod: "prog_bvod",
  progaudio: "prog_audio",
  progooh: "prog_ooh",
  // Concatenated normalizations
  digitaldisplay: "digital_display",
  digitalaudio: "digital_audio",
  digitalvideo: "digital_video",
  // Plural / wording variants
  newspapers: "newspaper",
  magazine: "magazines",
  out_of_home: "ooh",
  outdoor: "ooh",
  programmatic_display: "prog_display",
  programmatic_video: "prog_video",
  programmatic_bvod: "prog_bvod",
  programmatic_audio: "prog_audio",
  programmatic_ooh: "prog_ooh",
  tv: "television",
}

function splitWords(s: string): string[] {
  let x = s.trim()
  if (!x) return []
  x = x.replace(/[-_]+/g, " ")
  x = x.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  x = x.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  return x
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Title-style words → snake_case registry key (may be unknown to `MEDIA_TYPE_REGISTRY`). */
function wordsToSnakeKey(words: string[]): string {
  return words.join("_")
}

/**
 * Normalizes arbitrary labels (camelCase, Title Case, DB strings, kebab-case) to snake_case.
 * Known media types resolve to a `MEDIA_TYPE_REGISTRY` key; other strings still get stable snake_case.
 */
export function normalizeEntityKey(raw: string): string {
  const words = splitWords(raw)
  if (words.length === 0) return ""
  const snake = wordsToSnakeKey(words)
  const alias = REGISTRY_KEY_ALIASES[snake]
  if (alias) return alias
  if (snake in MEDIA_TYPE_REGISTRY) return snake as MediaTypeRegistryKey
  return snake
}

function humanizeSnake(key: string): string {
  if (!key) return ""
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function fnv1a32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
    h >>>= 0
  }
  return h
}

/**
 * Stable hex colour for any string (e.g. publisher / client names not in the media registry).
 * Uses the same ramp as `FALLBACK_PALETTE` so unknowns stay visually consistent with chart defaults.
 */
export function getDeterministicColor(name: string): string {
  const key = normalizeEntityKey(name) || name.trim().toLowerCase()
  const h = fnv1a32(key)
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length]!
}

export function getMediaColor(key: string): string {
  const n = normalizeEntityKey(key)
  const row = MEDIA_TYPE_REGISTRY[n as MediaTypeRegistryKey]
  if (row) return row.color
  return getDeterministicColor(key)
}

export function getMediaLabel(key: string): string {
  const n = normalizeEntityKey(key)
  const row = MEDIA_TYPE_REGISTRY[n as MediaTypeRegistryKey]
  if (row) return row.label
  return humanizeSnake(n) || key.trim()
}

/**
 * Maps series names to colours: registry colours for known media types; otherwise deterministic assignment.
 * - `media`: each unknown name gets `getDeterministicColor` (stable per normalized key via hash).
 * - `generic`: unknowns consume `FALLBACK_PALETTE` in first-seen order (distinct colours for ranked / ad-hoc series).
 */
export function assignEntityColors(
  names: string[],
  type: "media" | "generic" = "media"
): Map<string, string> {
  const map = new Map<string, string>()
  const unknownNormToColor = new Map<string, string>()
  let genericCursor = 0

  for (const name of names) {
    const n = normalizeEntityKey(name)
    const row = MEDIA_TYPE_REGISTRY[n as MediaTypeRegistryKey]
    if (row) {
      map.set(name, row.color)
      continue
    }
    let c = unknownNormToColor.get(n)
    if (!c) {
      if (type === "generic") {
        c = FALLBACK_PALETTE[genericCursor % FALLBACK_PALETTE.length]!
        genericCursor += 1
      } else {
        c = getDeterministicColor(name)
      }
      unknownNormToColor.set(n, c)
    }
    map.set(name, c)
  }

  return map
}
