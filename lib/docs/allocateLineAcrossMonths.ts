import { fromCents, sumCents, toCents } from "@/lib/money"

/**
 * Spread a line total across months in proportion to media weights.
 * Each month except the last is half-up cents. The last month is the residue,
 * so the months sum to the line. Zero total weight leaves every month at 0.
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

  const weightCents = keys.map((key) => toCents(args.weights[key] ?? 0))
  const weightSum = sumCents(weightCents)
  if (weightSum === 0) return out

  const head: number[] = []
  for (let i = 0; i < keys.length - 1; i++) {
    const share = fromCents(totalCents) * (weightCents[i]! / weightSum)
    head.push(toCents(share))
  }
  const used = head.length === 0 ? 0 : sumCents(head)
  const cents = [...head, totalCents - used]
  keys.forEach((key, i) => {
    out[key] = fromCents(cents[i]!)
  })
  return out
}

/** Dollar total of parts that are already on cent boundaries. */
export function dollarsFromPartCents(parts: readonly number[]): number {
  return fromCents(sumCents(parts.map((part) => toCents(part))))
}
