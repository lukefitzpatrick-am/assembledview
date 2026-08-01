/** Dollars → integer cents (banker's round half-to-even), same as migration `toCents`. */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error(`dollarsToCents: non-finite ${dollars}`)
  }
  const scaled = dollars * 100
  const floored = Math.floor(scaled)
  const diff = scaled - floored
  if (diff > 0.5) return floored + 1
  if (diff < 0.5) return floored
  return floored % 2 === 0 ? floored : floored + 1
}

export function coerceDollars(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[$,\s]/g, ""))
    if (Number.isFinite(n)) return n
  }
  return 0
}
