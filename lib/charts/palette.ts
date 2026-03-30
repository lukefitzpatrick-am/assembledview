import { FALLBACK_PALETTE as REGISTRY_FALLBACK } from "@/lib/charts/registry"

const FALLBACK_PALETTE = [...REGISTRY_FALLBACK]

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
