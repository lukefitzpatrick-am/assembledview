/**
 * Planner estimate: "1h 30m" / "45m" / "2h" ↔ minutes.
 * Unrecognised input is null (never coerced to zero).
 */

const ESTIMATE_RE =
  /^~?\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*$/i

export function parseEstimateToMinutes(
  raw: string | null | undefined
): number | null {
  if (raw == null) return null
  const text = raw.trim()
  if (!text) return null
  const compact = text.replace(/\s+/g, " ")
  const m = compact.match(ESTIMATE_RE)
  if (!m) return null
  const hours = m[1] != null ? Number(m[1]) : 0
  const minutes = m[2] != null ? Number(m[2]) : 0
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours <= 0 && minutes <= 0) return null
  const total = hours * 60 + minutes
  return total > 0 ? total : null
}

export function formatMinutesAsEstimate(
  minutes: number | null | undefined
): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const whole = Math.round(minutes)
  const h = Math.floor(whole / 60)
  const m = whole % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}
