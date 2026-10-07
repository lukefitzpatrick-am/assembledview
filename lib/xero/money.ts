import { toCents } from "@/lib/money"

/** Dollars → integer cents. Half-up, away from zero, via lib/money. */
export function dollarsToCents(dollars: number): number {
  return toCents(dollars)
}

export function coerceDollars(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[$,\s]/g, ""))
    if (Number.isFinite(n)) return n
  }
  return 0
}
