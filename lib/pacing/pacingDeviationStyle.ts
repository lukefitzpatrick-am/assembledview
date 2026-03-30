/**
 * Live pacing UI bands vs 100% expected pace:
 * ≤10 pts: on track (green), 10–20: slight (amber), >20: off (red).
 */
export function pacingDeviationBorderClass(pacingPct: number): string {
  const d = Math.abs(Number(pacingPct) - 100)
  if (!Number.isFinite(d)) return "border-l-4 border-l-green-500"
  if (d <= 10) return "border-l-4 border-l-green-500"
  if (d <= 20) return "border-l-4 border-l-amber-500"
  return "border-l-4 border-l-red-500"
}

export function pacingDeviationSparklineClass(pacingPct: number): string {
  const d = Math.abs(Number(pacingPct) - 100)
  if (!Number.isFinite(d)) return "text-green-600"
  if (d <= 10) return "text-green-600"
  if (d <= 20) return "text-amber-600"
  return "text-red-600"
}
