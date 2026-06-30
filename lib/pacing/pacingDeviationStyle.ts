export function pacingDeviationSparklineClass(pacingPct: number): string {
  const d = Math.abs(Number(pacingPct) - 100)
  if (!Number.isFinite(d)) return "text-status-on-track-fg"
  if (d <= 10) return "text-status-on-track-fg"
  if (d <= 20) return "text-status-behind-fg"
  return "text-status-critical-fg"
}
