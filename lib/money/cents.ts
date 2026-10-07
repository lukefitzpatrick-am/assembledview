/**
 * One cents conversion for runtime code.
 * Half-up, away from zero, robust to binary float error.
 * Migration scripts keep their own half-even helper.
 */

export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new TypeError(`toCents: non-finite ${dollars}`)
  }
  const sign = dollars < 0 ? -1 : 1
  const scaled = Math.abs(dollars) * 100
  const cents = Math.round(scaled + Math.max(scaled, 1) * Number.EPSILON)
  const out = sign * cents
  return out === 0 ? 0 : out
}

export function toCentsOrNull(dollars: unknown): number | null {
  if (typeof dollars !== "number" || !Number.isFinite(dollars)) return null
  return toCents(dollars)
}

export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new TypeError(`fromCents: non-finite ${cents}`)
  }
  return cents / 100
}

/** Integer sum. Throws if a value is not an integer cent. */
export function sumCents(values: readonly number[]): number {
  let sum = 0
  for (const value of values) {
    if (!Number.isInteger(value)) {
      throw new TypeError(`sumCents: non-integer ${value}`)
    }
    sum += value
  }
  return sum
}

export function roundMoney2(dollars: number): number {
  return fromCents(toCents(dollars))
}
