const FALLBACK_PALETTE = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#06b6d4",
  "#f43f5e",
  "#a855f7",
  "#0ea5e9",
  "#f59e0b",
]

function isValidHexColour(value?: string) {
  if (!value) return false
  const trimmed = value.trim().replace("#", "")
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : trimmed

  return /^[0-9a-fA-F]{6}$/.test(expanded)
}

export function getSeriesColours(brandColour?: string): string[] {
  const basePalette = FALLBACK_PALETTE
  if (!isValidHexColour(brandColour)) {
    return basePalette
  }

  return [brandColour!.trim(), ...basePalette]
}
