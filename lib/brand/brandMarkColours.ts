/** Assembled pixel-grid brand mark palette — single source of truth for logo colours. */
export const BRAND_MARK_COLOURS = {
  lime: "hsl(var(--accent))",
  teal: "var(--channel-social)",
  green: "hsl(var(--primary))",
  blue: "hsl(var(--secondary))",
  purple: "var(--channel-bvod)",
} as const

export type BrandMarkColourKey = keyof typeof BRAND_MARK_COLOURS

/** 3×3 Assembled pixel mark (row-major, top-left → bottom-right). */
export const BRAND_MARK_GRID: readonly BrandMarkColourKey[][] = [
  ["lime", "teal", "green"],
  ["purple", "blue", "lime"],
  ["green", "teal", "purple"],
] as const
