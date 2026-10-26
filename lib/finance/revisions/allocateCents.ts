/**
 * Split integer cents across weighted keys (billing revisions, design 3.3).
 *
 * - floor(total * w / W) per key, in BigInt so large totals never lose cents.
 * - The remainder goes to the largest weight (tie: first in order).
 * - When total <= W no key gets more than its weight. If the largest key has
 *   no room, the rest spills to the next largest with room. This keeps every
 *   "take from a cell" share within the cell, so no cell goes below zero.
 * - W = 0 means equal weights (no cap).
 */

export type WeightEntry<K extends string> = readonly [K, number]

function assertCents(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`allocateCents: ${what} must be a non-negative integer (got ${value})`)
  }
}

export function allocateCents<K extends string>(
  total: number,
  weights: ReadonlyArray<WeightEntry<K>>,
): Map<K, number> {
  assertCents(total, "total")
  const out = new Map<K, number>()
  if (weights.length === 0) {
    if (total !== 0) throw new Error("allocateCents: no keys to allocate to")
    return out
  }
  for (const [key, w] of weights) {
    assertCents(w, `weight for ${key}`)
    if (out.has(key)) throw new Error(`allocateCents: duplicate key ${key}`)
    out.set(key, 0)
  }

  let sumW = 0n
  for (const [, w] of weights) sumW += BigInt(w)
  const equal = sumW === 0n
  const effective: Array<[K, bigint]> = weights.map(([k, w]) => [k, equal ? 1n : BigInt(w)])
  const W = equal ? BigInt(weights.length) : sumW
  const capped = !equal && BigInt(total) <= W

  const T = BigInt(total)
  let allocated = 0n
  for (const [k, w] of effective) {
    const share = (T * w) / W
    out.set(k, Number(share))
    allocated += share
  }
  let remainder = Number(T - allocated)

  const order = effective
    .map(([k, w], index) => ({ k, w, index }))
    .sort((a, b) => (a.w === b.w ? a.index - b.index : a.w > b.w ? -1 : 1))

  for (const { k, w } of order) {
    if (remainder <= 0) break
    const current = out.get(k) ?? 0
    const room = capped ? Number(w) - current : remainder
    if (room <= 0) continue
    const give = Math.min(room, remainder)
    out.set(k, current + give)
    remainder -= give
  }
  if (remainder > 0) {
    // Only reachable when uncapped maths and rounding disagree. Never silent.
    throw new Error(`allocateCents: ${remainder} cents left unallocated`)
  }
  return out
}
