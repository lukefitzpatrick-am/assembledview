/**
 * Australia/Sydney weekday arithmetic. Mon–Fri only — no public-holiday calendar
 * (same law as Codex `lastBusinessDaySydneyYmd`).
 */

import { addSydneyDays } from "@/lib/codex/quickAddParse"
import { weekdayOfSydneyYmd } from "@/lib/codex/recurringRule"

function isSydneyWeekday(ymd: string): boolean {
  const dow = weekdayOfSydneyYmd(ymd)
  return dow !== 0 && dow !== 6
}

/** Walk back `n` Sydney weekdays from `ymd`. n=0 returns `ymd`. */
export function subtractSydneyBusinessDays(ymd: string, n: number): string {
  let remaining = n
  let cursor = ymd
  while (remaining > 0) {
    cursor = addSydneyDays(cursor, -1)
    if (isSydneyWeekday(cursor)) remaining -= 1
  }
  return cursor
}

/**
 * Remaining Sydney weekdays from `fromYmd` to `toYmd` (0 if same day).
 * Negative when `toYmd` is before `fromYmd`.
 */
export function sydneyBusinessDaysUntil(fromYmd: string, toYmd: string): number {
  if (fromYmd === toYmd) return 0
  if (toYmd < fromYmd) return -sydneyBusinessDaysUntil(toYmd, fromYmd)
  let count = 0
  let cursor = fromYmd
  while (cursor < toYmd) {
    cursor = addSydneyDays(cursor, 1)
    if (isSydneyWeekday(cursor)) count += 1
  }
  return count
}
