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
