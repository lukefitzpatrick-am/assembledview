import type { PlanningAgeBand } from "@/lib/planning/types"
import { PLANNING_AGE_BANDS } from "@/lib/planning/types"

/** Band edge ages for the slider (inclusive lo, exclusive hi except last). */
export const AGE_BAND_EDGES = [14, 25, 35, 50, 65, 75] as const

export const AGE_BAND_DEFS: { id: PlanningAgeBand; lo: number; hi: number }[] = [
  { id: "14-24", lo: 14, hi: 24 },
  { id: "25-34", lo: 25, hi: 34 },
  { id: "35-49", lo: 35, hi: 49 },
  { id: "50-64", lo: 50, hi: 64 },
  { id: "65+", lo: 65, hi: 75 },
]

function nearestEdge(value: number): number {
  let best: number = AGE_BAND_EDGES[0]
  let bestDist = Math.abs(value - best)
  for (const e of AGE_BAND_EDGES) {
    const d = Math.abs(value - e)
    if (d < bestDist) {
      best = e
      bestDist = d
    }
  }
  return best
}

/** Snap a continuous [lo, hi] to whole band boundaries. */
export function snapAgeRange(lo: number, hi: number): [number, number] {
  let a = nearestEdge(lo)
  let b = nearestEdge(hi)
  if (a >= b) {
    // Ensure at least one band width.
    const ai = AGE_BAND_EDGES.indexOf(a as (typeof AGE_BAND_EDGES)[number])
    if (ai < AGE_BAND_EDGES.length - 1) b = AGE_BAND_EDGES[ai + 1]
    else a = AGE_BAND_EDGES[ai - 1]
  }
  return [a, b]
}

/** Whole bands covered by a snapped [lo, hi] edge pair. */
export function bandsFromRange(lo: number, hi: number): PlanningAgeBand[] {
  const [a, b] = snapAgeRange(lo, hi)
  return AGE_BAND_DEFS.filter((band) => {
    const edgeHi = AGE_BAND_EDGES[AGE_BAND_DEFS.findIndex((d) => d.id === band.id) + 1] ?? 75
    return band.lo >= a && edgeHi <= b
  }).map((band) => band.id)
}

/** Derive slider [lo, hi] from selected bands (contiguous assumed). */
export function rangeFromBands(bands: PlanningAgeBand[]): [number, number] {
  if (bands.length === 0) return [25, 50]
  const defs = AGE_BAND_DEFS.filter((d) => bands.includes(d.id))
  if (defs.length === 0) return [25, 50]
  const lo = Math.min(...defs.map((d) => d.lo))
  const hiEdge = Math.max(
    ...defs.map((d) => {
      const idx = AGE_BAND_DEFS.findIndex((x) => x.id === d.id)
      return AGE_BAND_EDGES[idx + 1] ?? 75
    })
  )
  return [lo, hiEdge]
}

export function formatAgeBandLabel(bands: PlanningAgeBand[]): string {
  if (bands.length === 0) return "none"
  if (bands.length === PLANNING_AGE_BANDS.length) return "all ages"
  return bands.join(", ")
}
