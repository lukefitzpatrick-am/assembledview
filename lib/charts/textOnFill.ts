/**
 * Pick readable label colour (white vs near-black) for text drawn on an arbitrary CSS fill.
 * Parses hex / rgb(a) / hsl(a) literals only; `var()` / `currentColor` → null (use theme default).
 */

function linearizeSrgbChannel(c255: number): number {
  const c = Math.max(0, Math.min(255, c255)) / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG 2.x relative luminance, 0–1 (higher = lighter). */
export function relativeLuminance(r255: number, g255: number, b255: number): number {
  const R = linearizeSrgbChannel(r255)
  const G = linearizeSrgbChannel(g255)
  const B = linearizeSrgbChannel(b255)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function parseHexRgb(input: string): { r: number; g: number; b: number } | null {
  let h = input.trim()
  if (!h.startsWith("#")) return null
  h = h.slice(1)
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    }
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if ([r, g, b].some((n) => Number.isNaN(n))) return null
    return { r, g, b }
  }
  return null
}

function parseRgbFunction(input: string): { r: number; g: number; b: number } | null {
  const m = input.match(
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[, /]\s*([0-9.]+%?))?\s*\)$/i,
  )
  if (!m) return null
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  if (![r, g, b].every((n) => Number.isFinite(n))) return null
  return {
    r: Math.round(Math.max(0, Math.min(255, r))),
    g: Math.round(Math.max(0, Math.min(255, g))),
    b: Math.round(Math.max(0, Math.min(255, b))),
  }
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.max(0, Math.min(1, s))
  const ll = Math.max(0, Math.min(1, l))
  if (ss === 0) {
    const v = Math.round(ll * 255)
    return { r: v, g: v, b: v }
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const r = hueToRgb(p, q, hh / 360 + 1 / 3)
  const g = hueToRgb(p, q, hh / 360)
  const b = hueToRgb(p, q, hh / 360 - 1 / 3)
  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255))),
    g: Math.round(Math.max(0, Math.min(255, g * 255))),
    b: Math.round(Math.max(0, Math.min(255, b * 255))),
  }
}

function parseHslFunction(input: string): { r: number; g: number; b: number } | null {
  const modern = input.match(
    /^hsla?\(\s*([0-9.]+)(?:deg)?\s+([0-9.]+)%\s+([0-9.]+)%(?:\s*[/ ]\s*([0-9.]+%?))?\s*\)$/i,
  )
  if (modern) {
    const h = Number(modern[1])
    const s = Number(modern[2]) / 100
    const l = Number(modern[3]) / 100
    if (![h, s, l].every((n) => Number.isFinite(n))) return null
    return hslToRgb(h, s, l)
  }
  const classic = input.match(
    /^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%(?:\s*,\s*([0-9.]+))?\s*\)$/i,
  )
  if (classic) {
    const h = Number(classic[1])
    const s = Number(classic[2]) / 100
    const l = Number(classic[3]) / 100
    if (![h, s, l].every((n) => Number.isFinite(n))) return null
    return hslToRgb(h, s, l)
  }
  return null
}

export function parseCssColorToRgb(fill: string): { r: number; g: number; b: number } | null {
  if (!fill || /var\s*\(/i.test(fill) || /^currentColor$/i.test(fill.trim())) return null
  const t = fill.trim()
  const hex = parseHexRgb(t)
  if (hex) return hex
  const rgb = parseRgbFunction(t)
  if (rgb) return rgb
  const hsl = parseHslFunction(t)
  if (hsl) return hsl
  return null
}

/**
 * `#ffffff` vs `#0a0a0a` based on which achieves higher WCAG contrast vs the fill.
 * Returns `null` if the fill cannot be resolved to RGB (e.g. `hsl(var(--muted))`).
 */
export function pickContrastingTextColorForFill(fill: string | undefined | null): string | null {
  const rgb = parseCssColorToRgb(fill?.trim() ?? "")
  if (!rgb) return null
  const L = relativeLuminance(rgb.r, rgb.g, rgb.b)
  const contrastWhite = (1 + 0.05) / (L + 0.05)
  const contrastBlack = (L + 0.05) / 0.05
  return contrastWhite >= contrastBlack ? "#ffffff" : "#0a0a0a"
}
