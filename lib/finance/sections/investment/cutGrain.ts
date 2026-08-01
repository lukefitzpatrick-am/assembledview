/**
 * Actuals (Xero) grain rules for Investment cut.
 * AR joins at MBA×month only — never prorate across line-level dims.
 */

import type { InvestmentCutDim, InvestmentCutMeasure } from "./cutTypes"

/** Dims derivable from MBA×month (AR reality). */
export const MBA_MONTH_GRAIN_DIMS = ["client", "month", "fy"] as const

export type MbaMonthGrainDim = (typeof MBA_MONTH_GRAIN_DIMS)[number]

export const ACTUALS_MEASURES = [
  "invoiced_cents",
  "paid_cents",
  "invoiced_delta_cents",
] as const

export type ActualsMeasure = (typeof ACTUALS_MEASURES)[number]

export const LINE_LEVEL_DIMS = [
  "channelGroup",
  "channel",
  "publisher",
  "buyType",
  "market",
  "billingAgency",
] as const

export type LineLevelDim = (typeof LINE_LEVEL_DIMS)[number]

const MBA_SET = new Set<string>(MBA_MONTH_GRAIN_DIMS)
const LINE_SET = new Set<string>(LINE_LEVEL_DIMS)
const ACTUALS_SET = new Set<string>(ACTUALS_MEASURES)

export function isActualsMeasure(m: string): m is ActualsMeasure {
  return ACTUALS_SET.has(m)
}

export function isMbaMonthGrainDim(d: string): d is MbaMonthGrainDim {
  return MBA_SET.has(d)
}

export function isLineLevelDim(d: string): d is LineLevelDim {
  return LINE_SET.has(d)
}

export function measuresIncludeActuals(measures: readonly string[]): boolean {
  return measures.some(isActualsMeasure)
}

/** Honest UI copy when a line-level dim blocks Actuals. */
export function actualsBlockedReasonForDim(dim: InvestmentCutDim): string {
  switch (dim) {
    case "publisher":
      return "Invoiced actuals aren't available by publisher — Xero invoices don't carry line detail"
    case "channel":
    case "channelGroup":
      return "Invoiced actuals aren't available by channel — Xero invoices don't carry line detail"
    case "buyType":
      return "Invoiced actuals aren't available by buy type — Xero invoices don't carry line detail"
    case "market":
      return "Invoiced actuals aren't available by market — Xero invoices don't carry line detail"
    case "billingAgency":
      return "Invoiced actuals aren't available by billing agency — Xero invoices don't carry line detail"
    default:
      return "Invoiced actuals are only available for client, month, and FY (MBA×month grain)"
  }
}

export type ActualsGrainViolation = {
  code: "ACTUALS_GRAIN_UNSUPPORTED"
  error: "ACTUALS_GRAIN_UNSUPPORTED"
  message: string
  blockedDimensions: InvestmentCutDim[]
  blockedFilters: string[]
  measures: ActualsMeasure[]
}

export type ActualsGrainOk = { ok: true }

export type ActualsGrainResult = ActualsGrainOk | ActualsGrainViolation

/**
 * Refuse Actuals when any dimension or line-level filter is not MBA×month-derivable.
 * Do not prorate — UI must surface the typed error / disabled picker state.
 */
export function validateActualsGrain(input: {
  dimensions: readonly InvestmentCutDim[]
  measures: readonly InvestmentCutMeasure[]
  filters?: {
    channels?: readonly string[]
    channelGroups?: readonly string[]
    publishers?: readonly string[]
    buyTypes?: readonly string[]
    markets?: readonly string[]
    billingAgency?: readonly string[]
  }
}): ActualsGrainResult {
  const actuals = input.measures.filter(isActualsMeasure)
  if (!actuals.length) return { ok: true }

  const blockedDimensions: LineLevelDim[] = input.dimensions.filter(isLineLevelDim)
  const blockedFilters: string[] = []
  const f = input.filters ?? {}
  if (f.channels?.length) blockedFilters.push("channels")
  if (f.channelGroups?.length) blockedFilters.push("channelGroups")
  if (f.publishers?.length) blockedFilters.push("publishers")
  if (f.buyTypes?.length) blockedFilters.push("buyTypes")
  if (f.markets?.length) blockedFilters.push("markets")
  if (f.billingAgency?.length) blockedFilters.push("billingAgency")

  if (!blockedDimensions.length && !blockedFilters.length) return { ok: true }

  // Prefer publisher/channel copy (most common user intent) over rollup dims.
  const priority: InvestmentCutDim[] = [
    "publisher",
    "channel",
    "channelGroup",
    "buyType",
    "market",
    "billingAgency",
  ]
  const blockedSet = new Set<string>(blockedDimensions)
  const primary =
    priority.find((d) => blockedSet.has(d)) ?? blockedDimensions[0]
  const message = primary
    ? actualsBlockedReasonForDim(primary)
    : "Invoiced actuals aren't available with line-level filters — Xero invoices don't carry line detail"

  return {
    code: "ACTUALS_GRAIN_UNSUPPORTED",
    error: "ACTUALS_GRAIN_UNSUPPORTED",
    message,
    blockedDimensions: [...blockedDimensions],
    blockedFilters,
    measures: actuals,
  }
}

/** Whether an Actuals measure can be selected given current dims (+ optional filters). */
export function isActualsMeasureAllowed(
  dimensions: readonly InvestmentCutDim[],
  filters?: ActualsGrainViolation extends never ? never : Parameters<typeof validateActualsGrain>[0]["filters"]
): { allowed: boolean; reason?: string } {
  const probe = validateActualsGrain({
    dimensions,
    measures: ["invoiced_cents"],
    filters,
  })
  if ("ok" in probe && probe.ok) return { allowed: true }
  const v = probe as ActualsGrainViolation
  return { allowed: false, reason: v.message }
}

/** Whether a dim can be added while Actuals measures are selected. */
export function isDimAllowedWithActuals(
  dim: InvestmentCutDim,
  selectedMeasures: readonly InvestmentCutMeasure[]
): { allowed: boolean; reason?: string } {
  if (!measuresIncludeActuals(selectedMeasures)) return { allowed: true }
  if (isMbaMonthGrainDim(dim) || !isLineLevelDim(dim)) return { allowed: true }
  return { allowed: false, reason: actualsBlockedReasonForDim(dim) }
}

/** Full dim × measure allow matrix for docs/tests. */
export function grainRuleMatrix(): Array<{
  dim: InvestmentCutDim
  measure: InvestmentCutMeasure
  allowed: boolean
}> {
  const dims: InvestmentCutDim[] = [
    "client",
    "channelGroup",
    "channel",
    "publisher",
    "buyType",
    "market",
    "month",
    "fy",
    "billingAgency",
  ]
  const measures: InvestmentCutMeasure[] = [
    "media_cents",
    "fee_cents",
    "adserving_cents",
    "billable_cents",
    "invoiced_cents",
    "paid_cents",
    "invoiced_delta_cents",
  ]
  const out: Array<{ dim: InvestmentCutDim; measure: InvestmentCutMeasure; allowed: boolean }> =
    []
  for (const dim of dims) {
    for (const measure of measures) {
      if (!isActualsMeasure(measure)) {
        out.push({ dim, measure, allowed: true })
        continue
      }
      out.push({ dim, measure, allowed: isMbaMonthGrainDim(dim) })
    }
  }
  return out
}
