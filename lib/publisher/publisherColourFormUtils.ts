/** Default / empty state for native `<input type="color">` when stored value is missing or invalid. */
export const NATIVE_COLOR_INPUT_FALLBACK = "#c4c4c4"

export function normalizeDefaultPublisherColour(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  return s === "" ? null : s
}

/** Valid #rgb or #rrggbb for swatch / native color input value. */
export function cssHexFromStored(hex: string | null | undefined): string | undefined {
  if (hex == null || hex === "") return undefined
  const t = hex.trim()
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const r = t[1],
      g = t[2],
      b = t[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t.toLowerCase()
  return undefined
}
