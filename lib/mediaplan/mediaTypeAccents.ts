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

/**
 * Media colour is a mark only: dots, stripes, rails, accent borders, and chart marks.
 * It is never text, never a button or toggle fill, and never a shadow or ring.
 * The hex argument on the text, totals, and badge helpers is ignored.
 */

/** Solid family colour for the summary card stripe. */
export function mediaTypeSummaryStripeStyle(hex: string): CSSProperties {
  return { backgroundColor: hex }
}

/** Neutral pill. Family colour is not the badge fill or its text. */
export function mediaTypeLineItemBadgeStyle(_hex: string): CSSProperties {
  return {
    backgroundColor: "var(--tone-neutral-bg)",
    color: "var(--tone-neutral-fg)",
  }
}

/** Totals hairline. Border token, not the family colour. Use with `className="... border-t-2 border-solid"`. */
export function mediaTypeTotalsRowStyle(_hex: string): CSSProperties {
  return {
    borderTopColor: "hsl(var(--border))",
  }
}

/** Total figure. Foreground token, not the family colour. */
export function mediaTypeAccentTextStyle(_hex: string): CSSProperties {
  return { color: "hsl(var(--foreground))" }
}

/** Pulsing schedule segment. An outline, not a shadow or a ring. */
export function mediaTypeOutlineStyle(hex: string): CSSProperties {
  return { outline: `2px solid ${hex}`, outlineOffset: 2 }
}

export function getMediaTypeThemeHex(key: MediaTypeThemeKey): string {
  return mediaTypeTheme.colors[key]
}
