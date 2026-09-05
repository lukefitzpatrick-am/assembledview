/**
 * Modelled delivered spend for programmatic lines whose delivery_source_map
 * row has derive_spend_from_plan = true.
 *
 * Rate is planned media ÷ planned deliverables. Daily spend is units(day) ×
 * rate, then capped at planned media. Deliverable pacing stays uncapped.
 * Never use burst.buyAmount as the rate (it is only an assertion check).
 */

export type DerivedSpendUnitsField = "impressions" | "clicks" | "results"

export type DeriveSpendBurstInput = Record<string, unknown>

export type DeriveSpendDayInput = {
  date: string
  impressions?: number
  clicks?: number
  results?: number
}

export type DerivedSpendDay = {
  date: string
  derivedSpend: number
  units: number
}

export type DeriveSpendFromPlanRateInput = {
  lineItemId: string
  buyType: string | null | undefined
  bursts: ReadonlyArray<DeriveSpendBurstInput | null | undefined>
  days: ReadonlyArray<DeriveSpendDayInput>
}

export type DeriveSpendFromPlanRateResult = {
  effectiveRate: number
  plannedTotal: number
  unitsField: DerivedSpendUnitsField
  buyTypeFallbackToImpressions: boolean
  usedBudgetFallback: boolean
  capReached: boolean
  capReachedOn: string | null
  days: DerivedSpendDay[]
  warnings: string[]
  cpmAssertion: {
    ok: boolean
    derivedCpm: number
    buyAmountCpm: number | null
  } | null
}

const CLICK_BUY_TYPES = new Set(["cpc", "cpa", "cpl"])

function parseCurrency(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "")
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ""
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function unitsFieldForBuyType(buyType: string): {
  field: DerivedSpendUnitsField
  fallback: boolean
} {
  const key = buyType.trim().toLowerCase()
  if (key === "cpm") return { field: "impressions", fallback: false }
  if (CLICK_BUY_TYPES.has(key)) return { field: "clicks", fallback: false }
  if (key === "cpv") return { field: "results", fallback: false }
  return { field: "impressions", fallback: true }
}

function unitsForDay(day: DeriveSpendDayInput, field: DerivedSpendUnitsField): number {
  if (field === "clicks") return Number(day.clicks) || 0
  if (field === "results") return Number(day.results) || 0
  return Number(day.impressions) || 0
}

function readMedia(burst: DeriveSpendBurstInput): { amount: number; fromBudget: boolean } {
  const rawMedia = burst.media_amount ?? burst.mediaAmount
  if (isPresent(rawMedia)) {
    return { amount: parseCurrency(rawMedia), fromBudget: false }
  }
  const budget = burst.budget_number ?? burst.budget ?? burst.media_investment
  if (isPresent(budget)) {
    return { amount: parseCurrency(budget), fromBudget: true }
  }
  return { amount: 0, fromBudget: false }
}

function readDeliverables(burst: DeriveSpendBurstInput): number {
  const raw = burst.calculated_value_number ?? burst.calculatedValue
  if (isPresent(raw)) return parseCurrency(raw)
  return 0
}

export function deriveSpendFromPlanRate(
  input: DeriveSpendFromPlanRateInput,
): DeriveSpendFromPlanRateResult {
  const warnings: string[] = []
  const lineId = String(input.lineItemId ?? "").trim() || "(unknown line)"
  const buyType = String(input.buyType ?? "")
  const { field: unitsField, fallback: buyTypeFallbackToImpressions } = unitsFieldForBuyType(buyType)

  if (buyTypeFallbackToImpressions) {
    warnings.push(
      `[derive-spend-from-plan] ${lineId}: unexpected buy_type "${buyType || "(blank)"}"; falling back to impressions (not chosen silently)`,
    )
  }

  let plannedTotal = 0
  let plannedDeliverables = 0
  let usedBudgetFallback = false
  const buyAmounts: number[] = []

  for (const raw of input.bursts) {
    if (!raw || typeof raw !== "object") continue
    const media = readMedia(raw)
    if (media.fromBudget) {
      usedBudgetFallback = true
    }
    plannedTotal += media.amount
    plannedDeliverables += readDeliverables(raw)
    const buyAmount = raw.buyAmount ?? raw.buy_amount
    if (isPresent(buyAmount)) buyAmounts.push(parseCurrency(buyAmount))
  }

  if (usedBudgetFallback) {
    warnings.push(
      `[derive-spend-from-plan] ${lineId}: burst mediaAmount missing; fell back to budget`,
    )
  }

  const effectiveRate = plannedDeliverables > 0 ? plannedTotal / plannedDeliverables : 0

  const buyTypeKey = buyType.trim().toLowerCase()
  let cpmAssertion: DeriveSpendFromPlanRateResult["cpmAssertion"] = null
  if (buyTypeKey === "cpm") {
    const derivedCpm = effectiveRate * 1000
    const buyAmountCpm = buyAmounts.length ? buyAmounts[0]! : null
    let ok = true
    if (buyAmountCpm != null) {
      for (const listed of buyAmounts) {
        if (Math.abs(derivedCpm - listed) > 0.01) {
          ok = false
          warnings.push(
            `[derive-spend-from-plan] ${lineId}: CPM assertion mismatch — effective_rate×1000=${derivedCpm.toFixed(4)} vs buyAmount=${listed.toFixed(2)}; using derived rate, never buyAmount`,
          )
        }
      }
    }
    cpmAssertion = { ok, derivedCpm, buyAmountCpm }
  }

  const sortedDays = [...input.days].toSorted((a, b) => a.date.localeCompare(b.date))
  const out: DerivedSpendDay[] = []
  let remaining = round2(plannedTotal)
  let capReachedOn: string | null = null

  if (effectiveRate <= 0 || remaining <= 0) {
    for (const day of sortedDays) {
      out.push({ date: day.date, derivedSpend: 0, units: unitsForDay(day, unitsField) })
    }
    return {
      effectiveRate,
      plannedTotal: round2(plannedTotal),
      unitsField,
      buyTypeFallbackToImpressions,
      usedBudgetFallback,
      capReached: false,
      capReachedOn: null,
      days: out,
      warnings,
      cpmAssertion,
    }
  }

  for (const day of sortedDays) {
    const units = unitsForDay(day, unitsField)
    if (remaining <= 0) {
      out.push({ date: day.date, derivedSpend: 0, units })
      continue
    }
    const uncapped = units * effectiveRate
    const derived = round2(Math.min(uncapped, remaining))
    remaining = round2(remaining - derived)
    out.push({ date: day.date, derivedSpend: derived, units })
    if (remaining <= 0 && capReachedOn == null) {
      capReachedOn = day.date
    }
  }

  return {
    effectiveRate,
    plannedTotal: round2(plannedTotal),
    unitsField,
    buyTypeFallbackToImpressions,
    usedBudgetFallback,
    capReached: capReachedOn != null,
    capReachedOn,
    days: out,
    warnings,
    cpmAssertion,
  }
}
