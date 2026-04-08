import { addMonths, format, parse } from "date-fns"

export type MonthRange = { from: string; to: string }

export function expandMonthRange(range: MonthRange): string[] {
  const from = range.from.trim()
  const to = range.to.trim()
  if (!from) return []
  if (!to || from === to) return [from]
  const out: string[] = []
  let cur = parse(from, "yyyy-MM", new Date())
  const end = parse(to, "yyyy-MM", new Date())
  if (cur > end) return [from]
  while (cur <= end) {
    out.push(format(cur, "yyyy-MM"))
    cur = addMonths(cur, 1)
  }
  return out
}
