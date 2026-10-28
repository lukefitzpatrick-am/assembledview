/**
 * Bursts on one line whose dates overlap (DQ-5, Luke 28 Oct 2026, decision
 * 21 (b)): the editor warns, it never blocks saving. Comparison is the civil
 * day, both ends inclusive, through `coerceBurstDateLocal` (the same Sydney
 * civil-day rules as the end-before-start check). A burst with a missing or
 * unreadable date, or an end before its start, is left out (that has its own
 * message). Pure. No I/O.
 */

import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"

export type BurstDates = { startDate?: unknown; endDate?: unknown } | null | undefined

export type BurstOverlap = {
  /** 1-based burst numbers, first < second. */
  first: number
  second: number
  /** Days both bursts cover, inclusive. */
  days: number
  /** First and last shared day (local midnight). */
  from: Date
  to: Date
}

const DAY_MS = 86_400_000

function dayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

function coerce(v: unknown): Date | null {
  if (v instanceof Date || typeof v === "string") return coerceBurstDateLocal(v)
  return null
}

/** Every pair of bursts on the line that share at least one day. */
export function findOverlappingBursts(bursts: readonly BurstDates[] | null | undefined): BurstOverlap[] {
  const spans: Array<{ n: number; start: Date; end: Date; s: number; e: number }> = []
  ;(bursts ?? []).forEach((b, i) => {
    const start = coerce(b?.startDate)
    const end = coerce(b?.endDate)
    if (!start || !end) return
    const s = dayNumber(start)
    const e = dayNumber(end)
    if (e < s) return
    spans.push({ n: i + 1, start, end, s, e })
  })
  const out: BurstOverlap[] = []
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      const a = spans[i]!
      const b = spans[j]!
      const from = Math.max(a.s, b.s)
      const to = Math.min(a.e, b.e)
      if (from > to) continue
      out.push({
        first: a.n,
        second: b.n,
        days: to - from + 1,
        from: a.s >= b.s ? a.start : b.start,
        to: a.e <= b.e ? a.end : b.end,
      })
    }
  }
  return out
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function dayLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** One overlap in words, for the editor warning. */
export function describeBurstOverlap(o: BurstOverlap): string {
  const span = o.days === 1 ? `on ${dayLabel(o.from)}` : `from ${dayLabel(o.from)} to ${dayLabel(o.to)}`
  return `Bursts ${o.first} and ${o.second} overlap ${span} (${o.days} ${o.days === 1 ? "day" : "days"}).`
}

export const BURST_OVERLAP_HINT =
  "Two bursts on this line cover the same days. Check the dates. Saving is not blocked."
