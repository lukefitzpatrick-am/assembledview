/**
 * Pure colour helpers for client-dashboard charts (no theme coupling).
 * Callers pass hex strings from `getChartPalette` / `ClientBrandTheme`.
 */

function normalizeHex6(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, "")
  if (raw.length === 3) {
    return `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase()
  }
  if (raw.length === 6 && /^[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase()
  }
  return null
}

export function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const n6 = normalizeHex6(hex)
  if (!n6) return null
  return {
    r: parseInt(n6.slice(0, 2), 16),
    g: parseInt(n6.slice(2, 4), 16),
    b: parseInt(n6.slice(4, 6), 16),
  }
}

function byteToHex2(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0")
}

/**
 * 8-digit hex `#RRGGBBAA` where `AA = round(ratio * 180)` (0–180), per dashboard heatmap spec.
 */
export function heatmapHexWithAlphaSuffix(baseHex: string, ratio: number): string {
  const n6 = normalizeHex6(baseHex)
  if (!n6) return baseHex
  const alphaByte = Math.min(255, Math.max(0, Math.round(ratio * 180)))
  return `#${n6}${byteToHex2(alphaByte)}`
}

/** `opacity = 0.4 + (intensity/100) * 0.55`, clamped to [0, 1]. */
export function treemapFillFromIntensity(primaryHex: string, intensity: number): string {
  const rgb = parseHexRgb(primaryHex)
  if (!rgb) {
    return primaryHex
  }
  const t = Math.min(100, Math.max(0, intensity))
  const opacity = 0.4 + (t / 100) * 0.55
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`
}
