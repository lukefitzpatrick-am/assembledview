export const DEFAULT_CLIENT_BRAND_COLOUR = "#49C7EB"

/**
 * Brand colour box while typing (C-177): `#`, hex digits only, upper case,
 * at most 6 digits. No padding, so backspace and typing work as expected.
 */
export function typedHexColour(value: string): string {
  const cleaned = value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
  return `#${cleaned}`.toUpperCase()
}

/**
 * The saved brand colour shape: `#` and 6 upper-case hex digits, an
 * incomplete value padded with `0`. Used by the colour picker and when the
 * text box loses focus (or Enter submits), so what is stored is unchanged.
 */
export function formatHexColour(value: string): string {
  return typedHexColour(value).padEnd(7, "0")
}
