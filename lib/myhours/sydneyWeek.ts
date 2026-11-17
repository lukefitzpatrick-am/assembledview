import { melbourneParts, toMelbourneDateString } from "@/lib/dates/melbourne"
import { addDaysISO } from "@/lib/dates/civil"

/**
 * Current civil week in Melbourne (Sydney shares its offset): Monday → Sunday inclusive.
 */
export function sydneyWeekRange(
  now: Date = new Date()
): { startYmd: string; endYmd: string } {
  const p = melbourneParts(now)
  // weekday: Sun=0 … Sat=6 → days since Monday
  const daysFromMonday = p.weekday === 0 ? 6 : p.weekday - 1
  const startYmd = addDaysISO(p.ymd, -daysFromMonday)
  const endYmd = addDaysISO(startYmd, 6)
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
    out.push(addDaysISO(startYmd, -7 * i))
  }
  return out
}

export function sydneyYmdFromUtcInstant(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid meeting start: ${isoOrDate}`)
  }
  return toMelbourneDateString(d)
}
