export function pacingDeviationSparklineClass(pacingPct: number): string {
  const d = Math.abs(Number(pacingPct) - 100)
  if (!Number.isFinite(d)) return "text-green-600"
  if (d <= 10) return "text-green-600"
  if (d <= 20) return "text-amber-600"
  return "text-red-600"
}
