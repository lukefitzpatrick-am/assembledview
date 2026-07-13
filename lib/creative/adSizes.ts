/** IAB display sizes used for slot matching (shared by inject script + mock templates). */
export const IAB_SIZES = [
  { width: 300, height: 250 },
  { width: 728, height: 90 },
  { width: 970, height: 250 },
  { width: 300, height: 600 },
  { width: 320, height: 50 },
  { width: 160, height: 600 },
  { width: 336, height: 280 },
  { width: 970, height: 90 },
] as const

export function nearestIabSize(
  width: number,
  height: number,
  tolerance = 2,
): { width: number; height: number } | null {
  for (const size of IAB_SIZES) {
    if (size.width === width && size.height === height) return size
  }
  for (const size of IAB_SIZES) {
    if (Math.abs(size.width - width) <= tolerance && Math.abs(size.height - height) <= tolerance) {
      return { width: size.width, height: size.height }
    }
  }
  return null
}

export function matchesCreativeSize(
  slotWidth: number,
  slotHeight: number,
  creativeWidth: number,
  creativeHeight: number,
  tolerance = 4,
): boolean {
  return (
    Math.abs(slotWidth - creativeWidth) <= tolerance &&
    Math.abs(slotHeight - creativeHeight) <= tolerance
  )
}
