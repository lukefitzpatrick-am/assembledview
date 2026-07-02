function toCurrencyNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    if (!cleaned) return undefined
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function hasExplicitBudgetKey(burst: Record<string, unknown> | null | undefined): boolean {
  if (!burst) return false
  const budget = burst.budget
  return budget !== null && budget !== undefined && String(budget).trim() !== ""
}

export type ResolvedProductionBurstBudget = {
  effectiveBudget: number
  deliverables: number
}

/**
 * Derive billing / viz budget from a burst that may use production `cost`×`amount`
 * or standard `budget` / `buyAmount` keys. Prefers explicit `budget` when present
 * so dual-written rows are not double-counted.
 */
export function resolveProductionBurstBudget(burst: unknown): ResolvedProductionBurstBudget {
  const raw = burst && typeof burst === "object" ? (burst as Record<string, unknown>) : {}

  if (hasExplicitBudgetKey(raw)) {
    const effectiveBudget = toCurrencyNumber(raw.budget) ?? 0
    const deliverables =
      toCurrencyNumber(raw.calculatedValue) ??
      toCurrencyNumber(raw.deliverables) ??
      toCurrencyNumber(raw.amount) ??
      0
    return { effectiveBudget, deliverables }
  }

  const cost = toCurrencyNumber(raw.cost)
  const amount =
    toCurrencyNumber(raw.amount) ??
    toCurrencyNumber(raw.deliverables) ??
    toCurrencyNumber(raw.calculatedValue)

  if (cost !== undefined && amount !== undefined) {
    return { effectiveBudget: cost * amount, deliverables: amount }
  }

  const effectiveBudget =
    toCurrencyNumber(raw.buyAmount) ??
    toCurrencyNumber(raw.spend) ??
    toCurrencyNumber(raw.media_investment) ??
    toCurrencyNumber(raw.investment) ??
    0

  const deliverables =
    toCurrencyNumber(raw.deliverables) ??
    toCurrencyNumber(raw.calculatedValue) ??
    toCurrencyNumber(raw.amount) ??
    0

  return { effectiveBudget, deliverables }
}

export type ProductionBurstPersistShape = {
  cost: number
  amount: number
  budget: string
  buyAmount: string
  calculatedValue: number
  startDate: string
  endDate: string
  description?: string
  market?: string
}

/**
 * Dual-write production bursts: keep cost/amount authoritative for hydration while
 * emitting standard keys for billing, viz, and analytics consumers.
 */
export function formatProductionBurstForPersist(
  burst: Record<string, unknown>,
  lineItem?: Record<string, unknown>
): ProductionBurstPersistShape {
  const cost = toCurrencyNumber(burst.cost ?? burst.budget ?? burst.mediaValue) ?? 0
  const amount =
    toCurrencyNumber(burst.amount ?? burst.deliverables ?? burst.buyAmount ?? burst.calculatedValue) ?? 0

  const startDate = String(burst.startDate ?? burst.start_date ?? "")
  const endDate = String(burst.endDate ?? burst.end_date ?? "")

  return {
    cost,
    amount,
    budget: String(cost * amount),
    buyAmount: String(amount),
    calculatedValue: amount,
    startDate,
    endDate,
    description: String(burst.description ?? lineItem?.description ?? ""),
    market: String(burst.market ?? lineItem?.market ?? ""),
  }
}
