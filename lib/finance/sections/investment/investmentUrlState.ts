/**
 * URL-encoded Investment explorer state (shareable cuts).
 */

import type { InvestmentCutBasis, InvestmentCutDim, InvestmentCutMeasure } from "./cutTypes"
import { INVESTMENT_CUT_DIMS, INVESTMENT_CUT_MEASURES } from "./cutTypes"
import { isActualsMeasure } from "./cutGrain"
import {
  getAgencyEconomicsPreset,
  isAgencyEconomicsMeasure,
  measuresIncludeAgencyEconomics,
  AGENCY_REVENUE_DIMS,
} from "./agencyEconomics"

export type InvestmentUrlState = {
  dimensions: InvestmentCutDim[]
  measures: InvestmentCutMeasure[]
  basis: InvestmentCutBasis
  search: string
  presetId: string | null
}

export const DEFAULT_INVESTMENT_URL_STATE: InvestmentUrlState = {
  dimensions: ["channelGroup", "publisher"],
  measures: ["media_cents", "fee_cents", "billable_cents"],
  basis: "billing",
  search: "",
  presetId: null,
}

function isDim(v: string): v is InvestmentCutDim {
  return (INVESTMENT_CUT_DIMS as readonly string[]).includes(v)
}

function isMeasure(v: string): v is InvestmentCutMeasure {
  return (INVESTMENT_CUT_MEASURES as readonly string[]).includes(v)
}

export function parseInvestmentUrlState(
  sp: URLSearchParams
): InvestmentUrlState {
  const presetRaw = sp.get("preset")?.trim() || null
  const preset = presetRaw ? getAgencyEconomicsPreset(presetRaw) : undefined
  if (preset) {
    return {
      ...preset.cut,
      search: sp.get("q") ?? sp.get("search") ?? preset.cut.search ?? "",
      presetId: preset.id,
    }
  }

  const dimsRaw = sp.get("dims") ?? sp.get("dimensions")
  const measuresRaw = sp.get("measures") ?? sp.get("metrics")
  const basisRaw = sp.get("cutBasis") ?? sp.get("ibasis")
  const search = sp.get("q") ?? sp.get("search") ?? ""

  let dimensions = DEFAULT_INVESTMENT_URL_STATE.dimensions
  if (dimsRaw?.trim()) {
    const parsed = dimsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(isDim)
    if (parsed.length) dimensions = [...new Set(parsed)]
  }

  let measures = DEFAULT_INVESTMENT_URL_STATE.measures
  if (measuresRaw?.trim()) {
    const parsed = measuresRaw
      .split(",")
      .map((s) => s.trim())
      .filter(isMeasure)
    if (parsed.length) measures = [...new Set(parsed)]
  }

  // Drop Actuals if dims would refuse — keep URL honest
  if (measures.some(isActualsMeasure)) {
    const line = dimensions.some(
      (d) =>
        d === "publisher" ||
        d === "channel" ||
        d === "channelGroup" ||
        d === "buyType" ||
        d === "market" ||
        d === "billingAgency"
    )
    if (line) {
      measures = measures.filter((m) => !isActualsMeasure(m))
      if (!measures.length) measures = [...DEFAULT_INVESTMENT_URL_STATE.measures]
    }
  }

  // Drop agency revenue measures if dims would refuse
  if (measuresIncludeAgencyEconomics(measures)) {
    const allowed = new Set<string>(AGENCY_REVENUE_DIMS)
    if (dimensions.some((d) => !allowed.has(d))) {
      measures = measures.filter((m) => !isAgencyEconomicsMeasure(m))
      if (!measures.length) measures = [...DEFAULT_INVESTMENT_URL_STATE.measures]
    }
  }

  const basis: InvestmentCutBasis =
    basisRaw === "delivery" ? "delivery" : "billing"

  return {
    dimensions,
    measures,
    basis,
    search: search.trim(),
    presetId: null,
  }
}

export function applyInvestmentUrlState(
  base: URLSearchParams,
  state: InvestmentUrlState
): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  next.set("dims", state.dimensions.join(","))
  next.set("measures", state.measures.join(","))
  next.set("cutBasis", state.basis)
  if (state.search) next.set("q", state.search)
  else next.delete("q")
  if (state.presetId) next.set("preset", state.presetId)
  else next.delete("preset")
  next.delete("search")
  next.delete("dimensions")
  next.delete("metrics")
  next.delete("ibasis")
  return next
}
