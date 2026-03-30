import type { CSSProperties } from "react"
import { mediaTypeTheme } from "@/lib/utils"

export type MediaTypeThemeKey = keyof typeof mediaTypeTheme.colors

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, "").trim()
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    }
  }
  if (h.length === 6 && /^[0-9a-fA-F]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  return null
}

/** Solid colour + alpha, for inline styles (Tailwind cannot see dynamic arbitrary hex classes). */
export function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(0,0,0,${alpha})`
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

/** Matches summary card stripe: solid → 70% → 40% opacity. */
export function mediaTypeSummaryStripeStyle(hex: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(to right, ${hex}, ${rgbaFromHex(hex, 0.7)}, ${rgbaFromHex(hex, 0.4)})`,
  }
}

/** Line item index badge: ~primary/10 background, full hex text. */
export function mediaTypeLineItemBadgeStyle(hex: string): CSSProperties {
  return {
    backgroundColor: rgbaFromHex(hex, 0.1),
    color: hex,
  }
}

/** Totals row: border-t-2 with ~primary/20. Use with `className="... border-t-2 border-solid"`. */
export function mediaTypeTotalsRowStyle(hex: string): CSSProperties {
  return {
    borderTopColor: rgbaFromHex(hex, 0.2),
  }
}

export function mediaTypeAccentTextStyle(hex: string): CSSProperties {
  return { color: hex }
}

export function getMediaTypeThemeHex(key: MediaTypeThemeKey): string {
  return mediaTypeTheme.colors[key]
}
