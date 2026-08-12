/**
 * Commercial display: minutes → hours, one decimal place.
 * Negative / non-finite inputs coerce to 0.
 */
export function minutesToHours(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round((minutes / 60) * 10) / 10
}

/** Sum raw minutes first, then round once (avoids 0.3+0.3+0.3 drift). */
export function sumMinutesToHours(minutesList: number[]): number {
  let total = 0
  for (const m of minutesList) {
    if (Number.isFinite(m) && m > 0) total += m
  }
  return minutesToHours(total)
}

/** Roster left-join: members with no entries render as 0 hours, never missing. */
export function mergeTeamHoursWithRoster(
  roster: Array<{ email: string; name: string; active: boolean }>,
  minutesByEmail: Map<string, number>
): Array<{
  email: string
  name: string
  active: boolean
  hours: number
  duration_minutes: number
}> {
  return roster.map((m) => {
    const email = m.email.toLowerCase()
    const duration_minutes = minutesByEmail.get(email) ?? 0
    return {
      email,
      name: m.name,
      active: m.active,
      duration_minutes,
      hours: minutesToHours(duration_minutes),
    }
  })
}
