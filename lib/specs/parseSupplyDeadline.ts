/**
 * Clean-pattern parser for supply-deadline prose.
 * Only structured min/max/business columns drive derivations.
 * Anything that is not an exact live-anchored working-days pattern is null.
 */

export type StructuredDeadline = {
  min_days: number
  max_days: number
  business_days: boolean
}

const RANGE =
  /^(\d+)\s*[-–]\s*(\d+)\s+working days(?:\s+before\s+live)?/i
const SINGLE = /^(\d+)\s+working days before live\b/i

export function parseSupplyDeadline(prose: string | null | undefined): StructuredDeadline | null {
  const text = (prose ?? "").trim()
  if (!text) return null

  const range = text.match(RANGE)
  if (range) {
    const min = Number(range[1])
    const max = Number(range[2])
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null
    return { min_days: min, max_days: max, business_days: true }
  }

  const single = text.match(SINGLE)
  if (single) {
    const n = Number(single[1])
    if (!Number.isFinite(n) || n < 1) return null
    return { min_days: n, max_days: n, business_days: true }
  }

  return null
}
