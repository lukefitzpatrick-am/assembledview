const DEFAULT_BRAND_COLOUR = "#49C7EB"

/**
 * Normalizes a hex color string to always have a # prefix
 */
export function normalizeHexColor(color?: string): string {
  if (!color) return DEFAULT_BRAND_COLOUR
  return color.startsWith("#") ? color : `#${color}`
}

/**
 * Converts a hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

/**
 * Lightens a hex color by a percentage
 */
function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * percent))
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * percent))
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * percent))

  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`
}

/**
 * Darkens a hex color by a percentage
 */
function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const r = Math.max(0, Math.round(rgb.r * (1 - percent)))
  const g = Math.max(0, Math.round(rgb.g * (1 - percent)))
  const b = Math.max(0, Math.round(rgb.b * (1 - percent)))

  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`
}

/**
 * Generates a gradient style object from a hex color
 * Creates a gradient from a lighter version to the original color
 */
export function generateGradientFromColor(color?: string): {
  background: string
} {
  const normalizedColor = normalizeHexColor(color)
  const lighterColor = lightenColor(normalizedColor, 0.3)
  const darkerColor = darkenColor(normalizedColor, 0.2)

  return {
    background: `linear-gradient(to right, ${lighterColor}, ${normalizedColor}, ${darkerColor})`,
  }
}

/**
 * Generates Tailwind-compatible gradient classes (if needed)
 * For now, we'll use inline styles for dynamic gradients
 */
export function getGradientStyle(color?: string): React.CSSProperties {
  const normalizedColor = normalizeHexColor(color)
  const lighterColor = lightenColor(normalizedColor, 0.3)
  const darkerColor = darkenColor(normalizedColor, 0.2)

  return {
    background: `linear-gradient(to right, ${lighterColor}, ${normalizedColor}, ${darkerColor})`,
  }
}


