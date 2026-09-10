import { roundMoney4 } from "@/lib/format/money"
import {
  BUY_TYPES_WITH_DERIVED_DELIVERABLES,
  type BuyType,
  deliverablesFromBudget,
  netMediaFromDeliverables,
  roundDeliverables,
} from "./deliverableBudget"

const DERIVED_SET = new Set<string>(BUY_TYPES_WITH_DERIVED_DELIVERABLES)

export type SolveMediaMathInput = {
  buyType: BuyType | string
  budget?: number | null
  rate?: number | null
  deliverables?: number | null
  weeks?: number | null
  months?: number | null
}

export type MediaMathTriple = {
  budget: number
  rate: number
  deliverables: number
}

export type SolveMediaMathOk = {
  ok: true
  solvedField: "budget" | "rate" | "deliverables"
  solvedValue: number
  triple: MediaMathTriple
  formula: string
  roundingApplied: string[]
  echoedInputs: SolveMediaMathInput
}

export type SolveMediaMathErr = {
  ok: false
  reason: string
}

export type SolveMediaMathResult = SolveMediaMathOk | SolveMediaMathErr

export function roundMoneyCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Algebraic inverse of {@link deliverablesFromBudget} for unit rate.
 * CPM: rate = (budget / deliverables) × 1000; else rate = budget / deliverables.
 */
export function rateFromBudgetAndDeliverables(
  buyType: BuyType,
  budget: number,
  deliverables: number,
): number {
  if (buyType === "cpm") {
    return (budget / deliverables) * 1000
  }
  return budget / deliverables
}

function presentNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function refuse(reason: string): SolveMediaMathErr {
  return { ok: false, reason }
}

function checkSign(name: string, value: number): SolveMediaMathErr | null {
  if (value < 0) {
    return refuse(`${name} must not be negative (got ${value}).`)
  }
  return null
}

function formulaFor(
  buyType: BuyType,
  solvedField: SolveMediaMathOk["solvedField"],
): string {
  if (buyType === "cpm") {
    if (solvedField === "deliverables") return "(budget / rate) × 1000"
    if (solvedField === "budget") return "(deliverables / 1000) × rate"
    return "(budget / deliverables) × 1000"
  }
  if (buyType === "weekly_rate" && solvedField === "budget") {
    return "rate × weeks"
  }
  if (buyType === "monthly_rate" && solvedField === "budget") {
    return "rate × months"
  }
  if (solvedField === "deliverables") return "budget / rate"
  if (solvedField === "budget") return "deliverables × rate"
  return "budget / deliverables"
}

export function solveMediaMath(input: SolveMediaMathInput): SolveMediaMathResult {
  const buyType = String(input.buyType || "").trim().toLowerCase() as BuyType
  if (!buyType) {
    return refuse("buyType is missing.")
  }
  if (!DERIVED_SET.has(buyType)) {
    return refuse(
      `buyType "${buyType}" has no derived deliverables. Need a type in BUY_TYPES_WITH_DERIVED_DELIVERABLES.`,
    )
  }
  if (buyType === "fixed_cost") {
    return refuse(
      "fixed_cost always has 1 deliverable and does not solve budget/rate/deliverables from a pair.",
    )
  }

  if (presentNumber(input.weeks) && buyType !== "weekly_rate") {
    return refuse("weeks is only valid for weekly_rate.")
  }
  if (presentNumber(input.months) && buyType !== "monthly_rate") {
    return refuse("months is only valid for monthly_rate.")
  }

  let budget = presentNumber(input.budget) ? input.budget : undefined
  let rate = presentNumber(input.rate) ? input.rate : undefined
  let deliverables = presentNumber(input.deliverables) ? input.deliverables : undefined

  if (buyType === "weekly_rate" && presentNumber(input.weeks)) {
    if (deliverables != null && deliverables !== input.weeks) {
      return refuse("weeks and deliverables both given and they disagree.")
    }
    deliverables = input.weeks
  }
  if (buyType === "monthly_rate" && presentNumber(input.months)) {
    if (deliverables != null && deliverables !== input.months) {
      return refuse("months and deliverables both given and they disagree.")
    }
    deliverables = input.months
  }

  for (const [name, value] of [
    ["budget", budget],
    ["rate", rate],
    ["deliverables", deliverables],
    ["weeks", presentNumber(input.weeks) ? input.weeks : undefined],
    ["months", presentNumber(input.months) ? input.months : undefined],
  ] as const) {
    if (value != null) {
      const bad = checkSign(name, value)
      if (bad) return bad
    }
  }

  const given = [
    budget != null ? "budget" : null,
    rate != null ? "rate" : null,
    deliverables != null ? "deliverables" : null,
  ].filter(Boolean)
  if (given.length === 3) {
    return refuse("Exactly two of budget, rate, and deliverables are required — three were given.")
  }
  if (given.length < 2) {
    const missing = ["budget", "rate", "deliverables"].filter((k) => !given.includes(k))
    return refuse(
      `Exactly two of budget, rate, and deliverables are required. Missing: ${missing.join(", ")}.`,
    )
  }

  const roundingApplied: string[] = []

  if (budget != null && rate != null) {
    if (rate === 0) {
      return refuse("rate is 0 — cannot divide by zero.")
    }
    const raw = deliverablesFromBudget(buyType, budget, rate)
    if (!Number.isFinite(raw) || Number.isNaN(raw)) {
      return refuse("Could not derive deliverables from budget and rate.")
    }
    const rounded = roundDeliverables(buyType, raw)
    if (rounded !== raw) roundingApplied.push("deliverables rounded to whole units")
    return {
      ok: true,
      solvedField: "deliverables",
      solvedValue: rounded,
      triple: { budget: roundMoneyCents(budget), rate: roundMoneyCents(rate), deliverables: rounded },
      formula: formulaFor(buyType, "deliverables"),
      roundingApplied,
      echoedInputs: { ...input, buyType },
    }
  }

  if (rate != null && deliverables != null) {
    if (rate === 0 && buyType === "cpm") {
      return refuse("rate is 0 — cannot divide by zero.")
    }
    const raw = netMediaFromDeliverables(buyType, deliverables, rate)
    if (!Number.isFinite(raw) || Number.isNaN(raw)) {
      return refuse("Could not derive budget from rate and deliverables.")
    }
    const rounded = roundMoneyCents(raw)
    if (rounded !== raw) roundingApplied.push("budget rounded to cents")
    const dRounded = roundDeliverables(buyType, deliverables)
    if (dRounded !== deliverables) roundingApplied.push("deliverables rounded to whole units")
    return {
      ok: true,
      solvedField: "budget",
      solvedValue: rounded,
      triple: { budget: rounded, rate: roundMoneyCents(rate), deliverables: dRounded },
      formula: formulaFor(buyType, "budget"),
      roundingApplied,
      echoedInputs: { ...input, buyType },
    }
  }

  // budget + deliverables → rate
  if (budget == null || deliverables == null) {
    return refuse("Exactly two of budget, rate, and deliverables are required.")
  }
  if (deliverables === 0) {
    return refuse("deliverables is 0 — cannot divide by zero.")
  }
  const rawRate = rateFromBudgetAndDeliverables(buyType, budget, deliverables)
  if (!Number.isFinite(rawRate) || Number.isNaN(rawRate)) {
    return refuse("Could not derive rate from budget and deliverables.")
  }
  if (rawRate === 0) {
    return refuse("rate is 0 — cannot divide by zero.")
  }
  const roundedRate = roundMoney4(rawRate)
  if (roundedRate !== rawRate) roundingApplied.push("rate rounded to 4 decimal places")
  const dRounded = roundDeliverables(buyType, deliverables)
  if (dRounded !== deliverables) roundingApplied.push("deliverables rounded to whole units")
  return {
    ok: true,
    solvedField: "rate",
    solvedValue: roundedRate,
    triple: {
      budget: roundMoneyCents(budget),
      rate: roundedRate,
      deliverables: dRounded,
    },
    formula: formulaFor(buyType, "rate"),
    roundingApplied,
    echoedInputs: { ...input, buyType },
  }
}
