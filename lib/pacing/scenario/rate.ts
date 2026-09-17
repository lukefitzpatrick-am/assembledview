import type { ScenarioRate } from "./types.js"

export function remainingSpendToDeliverable(
  remainingSpend: number,
  rate: ScenarioRate | null,
): number | null {
  if (!rate || !Number.isFinite(rate.value) || rate.value <= 0) return null
  if (!Number.isFinite(remainingSpend)) return null
  if (rate.kind === "cpm") return remainingSpend / rate.value * 1_000
  return remainingSpend / rate.value
}

export function deliverableToSpend(units: number, rate: ScenarioRate | null): number {
  if (!rate || !Number.isFinite(rate.value) || rate.value <= 0) return Number.NaN
  if (rate.kind === "cpm") return units * (rate.value / 1_000)
  return units * rate.value
}
