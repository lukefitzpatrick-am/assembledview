import { CHART_CHANNEL_FALLBACK_FILL } from "@/lib/charts/theme"
import { mediaTypeTheme } from "@/lib/utils"

const DEFAULT_CHANNEL_COLOR = CHART_CHANNEL_FALLBACK_FILL

type MediaThemeKey = keyof typeof mediaTypeTheme.colors

/** Canonical hex per media type — same as `mediaTypeTheme` / mediaplan containers. */
const THEME = mediaTypeTheme.colors

/**
 * Normalized alias → canonical theme key (see `normalizeMediaChannelKey`).
 * Covers API/display variants: "TV", "digital display", "social", consulting, etc.
 */
const CHANNEL_ALIASES: Record<string, MediaThemeKey> = {
  tv: "television",
  digitaldisplay: "digidisplay",
  digitalaudio: "digiaudio",
  digitalvideo: "digivideo",
  social: "socialmedia",
  consulting: "production",
  /** Dashboard / API use full names; theme keys are abbreviated */
  programmaticdisplay: "progdisplay",
  programmaticvideo: "progvideo",
  programmaticbvod: "progbvod",
  programmaticaudio: "progaudio",
  programmaticooh: "progooh",
}

function buildChannelColorMap(): Record<string, string> {
  const map: Record<string, string> = { ...THEME }
  for (const [alias, themeKey] of Object.entries(CHANNEL_ALIASES)) {
    map[alias] = THEME[themeKey]
  }
  return map
}

const CHANNEL_COLOR_MAP: Record<string, string> = buildChannelColorMap()

const FALLBACK_RAMP = [
  "#4f46e5",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
] as const

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "")
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

export function normalizeMediaChannelKey(value?: string | null): string {
  if (!value) return ""
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, "")
}

function hashKey(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getMediaChannelColor(channel?: string | null): string {
  const normalized = normalizeMediaChannelKey(channel)
  if (!normalized) return DEFAULT_CHANNEL_COLOR
  const mapped = CHANNEL_COLOR_MAP[normalized]
  if (mapped) return mapped
  return FALLBACK_RAMP[hashKey(normalized) % FALLBACK_RAMP.length] ?? DEFAULT_CHANNEL_COLOR
}

export function buildMediaChannelColorMap(channels: Array<string | null | undefined>): Record<string, string> {
  return channels.reduce<Record<string, string>>((acc, channel) => {
    if (!channel) return acc
    acc[channel] = getMediaChannelColor(channel)
    return acc
  }, {})
}

export function getMediaChannelBadgeStyle(channel?: string | null): { backgroundColor: string; color: string; borderColor: string } {
  const color = getMediaChannelColor(channel)
  const rgb = hexToRgb(color)
  if (!rgb) {
    return {
      backgroundColor: "rgba(79, 70, 229, 0.14)",
      color,
      borderColor: "rgba(79, 70, 229, 0.3)",
    }
  }
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
    color,
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`,
  }
}
