import { addSydneyDays, sydneyCivilParts } from "@/lib/codex/quickAddParse"

/**
 * Current civil week in Australia/Sydney: Monday → Sunday inclusive.
 */
export function sydneyWeekRange(
  now: Date = new Date()
): { startYmd: string; endYmd: string } {
  const p = sydneyCivilParts(now)
  // weekday: Sun=0 … Sat=6 → days since Monday
  const daysFromMonday = p.weekday === 0 ? 6 : p.weekday - 1
  const startYmd = addSydneyDays(p.ymd, -daysFromMonday)
  const endYmd = addSydneyDays(startYmd, 6)
  return { startYmd, endYmd }
}

/**
 * Monday YMD strings for the last `n` Sydney weeks, oldest → newest
 * (newest = current week start).
 */
export function sydneyLastNWeekStarts(
  n: number,
  now: Date = new Date()
): string[] {
  const { startYmd } = sydneyWeekRange(now)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(addSydneyDays(startYmd, -7 * i))
  }
  return out
}

/** Today as YYYY-MM-DD in Australia/Sydney. */
export function sydneyTodayYmd(now: Date = new Date()): string {
  return sydneyCivilParts(now).ymd
}

export function sydneyYmdFromUtcInstant(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid meeting start: ${isoOrDate}`)
  }
  return sydneyCivilParts(d).ymd
}
