import { fromCents, sumCents, toCents } from "@/lib/money"

/**
 * Spread a line total across months in proportion to weights.
 * Each weighted month except the last weighted one is half-up cents. The last
 * month with a positive weight takes the residue, so the months sum to the
 * line and leftover cents never land in a month with no weight.
 * Zero total weight leaves every month at 0.
 */
export function allocateLineAcrossMonths(args: {
  lineTotal: number
  monthKeys: readonly string[]
  weights: Readonly<Record<string, number>>
}): Record<string, number> {
  const keys = [...args.monthKeys]
  const out: Record<string, number> = {}
  for (const key of keys) out[key] = 0
  if (keys.length === 0) return out

  const totalCents = toCents(args.lineTotal)
  if (totalCents === 0) return out

  const weightCents = keys.map((key) => Math.max(0, toCents(args.weights[key] ?? 0)))
  const weightSum = sumCents(weightCents)
  if (weightSum === 0) return out

  let residueIndex = -1
  for (let i = keys.length - 1; i >= 0; i--) {
    if (weightCents[i]! > 0) {
      residueIndex = i
      break
    }
  }

  const cents: number[] = keys.map(() => 0)
  let used = 0
  for (let i = 0; i < keys.length; i++) {
    if (i === residueIndex || weightCents[i] === 0) continue
    const share = toCents(fromCents(totalCents) * (weightCents[i]! / weightSum))
    cents[i] = share
    used = sumCents([used, share])
  }
  cents[residueIndex] = totalCents - used
  keys.forEach((key, i) => {
    out[key] = fromCents(cents[i]!)
  })
  return out
}

/** Dollar total of parts that are already on cent boundaries. */
export function dollarsFromPartCents(parts: readonly number[]): number {
  return fromCents(sumCents(parts.map((part) => toCents(part))))
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
]

/** "April 2026" -> 2026 * 12 + 3; null when the label is not a month. */
function monthLabelIndex(label: string): number | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(label ?? "").trim())
  if (!m) return null
  const idx = MONTH_NAMES.indexOf(m[1]!.toLowerCase())
  return idx < 0 ? null : Number(m[2]) * 12 + idx
}

/**
 * DOC-1 (Luke, 29 Oct 2026): the first and last day (UTC) of the earliest and
 * latest month that carries a non-zero billed amount, so the workbook timeline
 * can grow to give every billed fee and ad serving month its own column.
 * Labels that are not "Month YYYY" are ignored. Null when nothing is billed.
 */
export function billedMonthsTimelineBounds(
  amounts: ReadonlyArray<Readonly<Record<string, number>> | undefined>,
): { start: Date; end: Date } | null {
  let min: number | null = null
  let max: number | null = null
  for (const rec of amounts) {
    if (!rec) continue
    for (const [label, dollars] of Object.entries(rec)) {
      if (toCents(dollars) === 0) continue
      const idx = monthLabelIndex(label)
      if (idx == null) continue
      if (min == null || idx < min) min = idx
      if (max == null || idx > max) max = idx
    }
  }
  if (min == null || max == null) return null
  const start = new Date(Date.UTC(Math.floor(min / 12), min % 12, 1))
  const end = new Date(Date.UTC(Math.floor(max / 12), (max % 12) + 1, 0))
  return { start, end }
}

/**
 * DOC-1: place exact month amounts on the sheet's month columns, in cents.
 * A month on the sheet takes its amount as it is. generateMediaPlan extends
 * the timeline so every billed month has a column (billedMonthsTimelineBounds).
 * As a safety net, a month still off the sheet goes to the nearest edge column
 * (before the first column to the first, after the last to the last), so no
 * billed money drops off the row. Months with no amount are 0.
 */
export function placeMonthAmountsOnSheet(args: {
  amounts: Readonly<Record<string, number>>
  monthKeys: readonly string[]
}): Record<string, number> {
  const keys = [...args.monthKeys]
  const cents: number[] = keys.map(() => 0)
  const out: Record<string, number> = {}
  if (keys.length === 0) return out
  const indexByKey = new Map(keys.map((key, i) => [key, i]))
  const firstIdx = monthLabelIndex(keys[0]!)
  for (const [label, dollars] of Object.entries(args.amounts)) {
    const c = toCents(dollars)
    if (c === 0) continue
    let i = indexByKey.get(label)
    if (i == null) {
      const idx = monthLabelIndex(label)
      i = idx != null && firstIdx != null && idx < firstIdx ? 0 : keys.length - 1
    }
    cents[i] = sumCents([cents[i]!, c])
  }
  keys.forEach((key, i) => {
    out[key] = fromCents(cents[i]!)
  })
  return out
}
