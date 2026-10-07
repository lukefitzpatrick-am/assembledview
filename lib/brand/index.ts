import tokens from "./tokens.json"

export const BRAND = tokens

export type BrandColour = keyof typeof tokens.colour

export const EMAIL_FONT_STACK = tokens.font.email
  .map((name) => (name.includes(" ") ? `'${name}'` : name))
  .join(", ")

const HEX_COLOUR = /^#(?:([0-9a-fA-F]{3})|([0-9a-fA-F]{6}))$/

function expandHex(hex: string): string {
  const match = HEX_COLOUR.exec(hex)
  if (!match) {
    throw new Error(`Expected #RGB or #RRGGBB, received ${JSON.stringify(hex)}`)
  }
  const short = match[1]
  const long = match[2]
  if (long) return long.toUpperCase()
  if (!short) {
    throw new Error(`Expected #RGB or #RRGGBB, received ${JSON.stringify(hex)}`)
  }
  return short
    .split("")
    .map((channel) => channel + channel)
    .join("")
    .toUpperCase()
}

/** ExcelJS ARGB. "#246646" → "FF246646". */
export function hexToArgb(hex: string): string {
  return `FF${expandHex(hex)}`
}

/** jsPDF setTextColor / setFillColor channels, 0–255. */
export function hexToRgb(hex: string): [number, number, number] {
  const expanded = expandHex(hex)
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ]
}

function linearChannel(channel: number): number {
  const s = channel / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex)
  return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue)
}

function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Ink or white, whichever has the higher WCAG contrast on `hex`. */
export function readableTextOn(hex: string): string {
  const background = relativeLuminance(hex)
  const ink = BRAND.colour.ink
  const white = BRAND.colour.white
  const inkContrast = contrastRatio(relativeLuminance(ink), background)
  const whiteContrast = contrastRatio(relativeLuminance(white), background)
  return inkContrast >= whiteContrast ? ink : white
}

/** H 0–360, S and L 0–100, unrounded. */
export function hexToHslTriplet(hex: string): [number, number, number] {
  const [red, green, blue] = hexToRgb(hex)
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness * 100]

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return [hue, saturation * 100, lightness * 100]
}
