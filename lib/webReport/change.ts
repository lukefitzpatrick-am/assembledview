/**
 * Relative change versus the previous period.
 * Null when either side is missing or the previous value is zero.
 * Positive is up. The sign is part of the value.
 */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

export function formatChange(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const pct = value * 100
  const body = `${Math.abs(pct).toFixed(1)}%`
  if (pct > 0) return `+${body}`
  if (pct < 0) return `-${body}`
  return body
}
