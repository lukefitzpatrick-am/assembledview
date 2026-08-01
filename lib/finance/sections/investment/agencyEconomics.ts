/**
 * Agency-economics presets on the Investment cut engine.
 *
 * Historic FYs are blocked (FN0 fee-coverage / C-27 — schedule fee rows insufficient).
 * Adserving is NOT in revenue until Luke confirms (see INCLUDE_ADSERVING_IN_AGENCY_REVENUE).
 * margin_pct is neutral-formatted (no RAG) until Luke confirms thresholds.
 */

import {
  australianFyStartYearForDate,
  billingMonthsInAustralianFinancialYear,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import {
  FORECAST_MAPPING_SCHEMA_GAPS,
  getForecastLineMappingDefinition,
  getForecastRowDefinition,
} from "@/lib/finance/forecast/mapping/definitions"
import { FINANCE_FORECAST_LINE_KEYS } from "@/lib/types/financeForecast"
import type { InvestmentCutBasis, InvestmentCutDim, InvestmentCutMeasure } from "./cutTypes"

/** Luke decision — default exclude until confirmed. */
export const INCLUDE_ADSERVING_IN_AGENCY_REVENUE = false

/** Luke decision — no RAG bands until confirmed. */
export const AGENCY_MARGIN_RAG_THRESHOLDS: null | {
  goodMinPct: number
  warnMinPct: number
} = null

export const AGENCY_ECONOMICS_MEASURES = [
  "retainer_cents",
  "sow_cents",
  "revenue_cents",
  "margin_pct",
] as const

export type AgencyEconomicsMeasure = (typeof AGENCY_ECONOMICS_MEASURES)[number]

const AGENCY_SET = new Set<string>(AGENCY_ECONOMICS_MEASURES)

/** Dims that can carry client-level forecast revenue without prorating. */
export const AGENCY_REVENUE_DIMS = ["client", "month", "fy"] as const

export function isAgencyEconomicsMeasure(m: string): m is AgencyEconomicsMeasure {
  return AGENCY_SET.has(m)
}

export function measuresIncludeAgencyEconomics(measures: readonly string[]): boolean {
  return measures.some(isAgencyEconomicsMeasure)
}

export const AGENCY_ECONOMICS_HISTORIC_CAPTION =
  "Agency economics is current-FY only. Historic FYs are blocked: published-tip schedule fee rows are incomplete for legacy/ETL versions (FN0 fee-coverage / C-27), so fee_cents and margin would understate agency revenue."

export const AGENCY_ECONOMICS_CURRENT_FY_CAPTION =
  "Current FY only · fee line-month coverage may still be incomplete on legacy tips — see fee coverage meta. Retainer = forecast client monthlyretainer; SOW/PRIP = forecast placeholder (zeros until product fields land)."

export const AGENCY_ECONOMICS_ADSERVING_CAPTION = INCLUDE_ADSERVING_IN_AGENCY_REVENUE
  ? "Revenue includes adserving (Luke-confirmed)."
  : "Adserving excluded from revenue pending Luke confirmation (forecast maps adservingTechFees into service_fee_digital; cut adserving_cents is a separate schedule component)."

export const AGENCY_ECONOMICS_SOW_CAPTION = (() => {
  const def = getForecastLineMappingDefinition(FINANCE_FORECAST_LINE_KEYS.projectScopePrip)
  return `SOW/PRIP uses forecast mapping ${FINANCE_FORECAST_LINE_KEYS.projectScopePrip} (zeros — ${def?.businessRule ?? FORECAST_MAPPING_SCHEMA_GAPS.projectScopePrip}).`
})()

export type AgencyEconomicsHistoricError = {
  code: "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED"
  error: "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED"
  message: string
  fy: number
  currentFy: number
}

export function validateAgencyEconomicsFy(input: {
  fy: number
  measures: readonly InvestmentCutMeasure[]
  presetId?: string | null
  today?: Date
}): { ok: true } | AgencyEconomicsHistoricError {
  const needsGate =
    measuresIncludeAgencyEconomics(input.measures) ||
    Boolean(input.presetId && getAgencyEconomicsPreset(input.presetId))
  if (!needsGate) return { ok: true }

  const currentFy = australianFyStartYearForDate(input.today ?? new Date())
  if (input.fy >= currentFy) return { ok: true }

  return {
    code: "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED",
    error: "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED",
    message: AGENCY_ECONOMICS_HISTORIC_CAPTION,
    fy: input.fy,
    currentFy,
  }
}

/** Retainer/SOW/revenue/margin only on client/month/fy dims — never prorate across publisher/channel. */
export function validateAgencyRevenueGrain(input: {
  dimensions: readonly InvestmentCutDim[]
  measures: readonly InvestmentCutMeasure[]
}):
  | { ok: true }
  | {
      code: "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
      error: "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
      message: string
      blockedDimensions: InvestmentCutDim[]
    } {
  if (!measuresIncludeAgencyEconomics(input.measures)) return { ok: true }
  const allowed = new Set<string>(AGENCY_REVENUE_DIMS)
  const blocked = input.dimensions.filter((d) => !allowed.has(d))
  if (!blocked.length) return { ok: true }
  return {
    code: "AGENCY_REVENUE_GRAIN_UNSUPPORTED",
    error: "AGENCY_REVENUE_GRAIN_UNSUPPORTED",
    message:
      "Retainer/SOW/revenue/margin are client-level (forecast mapping) — not available by publisher, channel, or billingAgency. Use client / month / FY only.",
    blockedDimensions: blocked,
  }
}

export function marginPct(revenueCents: number, billableCents: number): number | null {
  if (!Number.isFinite(billableCents) || billableCents === 0) return null
  if (!Number.isFinite(revenueCents)) return null
  return Math.round((revenueCents / billableCents) * 1000) / 10
}

export function composeAgencyRevenueCents(parts: {
  feeCents: number
  retainerCents: number
  sowCents: number
  adservingCents?: number
}): number {
  let n = parts.feeCents + parts.retainerCents + parts.sowCents
  if (INCLUDE_ADSERVING_IN_AGENCY_REVENUE) {
    n += parts.adservingCents ?? 0
  }
  return n
}

/** Months in [from, to] that fall inside the FY (inclusive YYYY-MM). */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = []
  const [fy, fm] = from.split("-").map((x) => Number.parseInt(x, 10))
  const [ty, tm] = to.split("-").map((x) => Number.parseInt(x, 10))
  let y = fy!
  let m = fm!
  const end = ty! * 12 + tm!
  while (y * 12 + m <= end) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export type AgencyEconomicsPresetCut = {
  dimensions: InvestmentCutDim[]
  measures: InvestmentCutMeasure[]
  basis: InvestmentCutBasis
  search: string
  presetId: string
}

export type AgencyEconomicsPreset = {
  id: string
  name: string
  description: string
  /** URL/cut state (search cleared). */
  cut: AgencyEconomicsPresetCut
  /** Always force billing for agency economics. */
  basis: InvestmentCutBasis
}

/**
 * Seeded presets (code-seeded — PG `finance_saved_views` has no cut-config column;
 * hub saved views are localStorage report configs only).
 */
export const AGENCY_ECONOMICS_PRESETS: readonly AgencyEconomicsPreset[] = [
  {
    id: "client-profitability-fytd",
    name: "Client profitability FYTD",
    description: "Client × fee + retainer + SOW revenue × margin (current FY only)",
    basis: "billing",
    cut: {
      dimensions: ["client"],
      measures: [
        "fee_cents",
        "retainer_cents",
        "sow_cents",
        "revenue_cents",
        "billable_cents",
        "margin_pct",
      ],
      basis: "billing",
      search: "",
      presetId: "client-profitability-fytd",
    },
  },
  {
    id: "where-the-money-is",
    name: "Where the money is",
    description: "Channel group × billable vs fee (current FY only; fee caveat applies)",
    basis: "billing",
    cut: {
      dimensions: ["channelGroup"],
      measures: ["billable_cents", "fee_cents"],
      basis: "billing",
      search: "",
      presetId: "where-the-money-is",
    },
  },
] as const

export function getAgencyEconomicsPreset(id: string): AgencyEconomicsPreset | undefined {
  return AGENCY_ECONOMICS_PRESETS.find((p) => p.id === id)
}

/** "Where the money is" uses fee/billable only — still historic-gated via preset id. */
export function presetNeedsAgencyHistoricGate(presetId: string | null | undefined): boolean {
  return Boolean(presetId && getAgencyEconomicsPreset(presetId))
}

export function forecastRetainerMappingRef(): string {
  const def = getForecastRowDefinition(FINANCE_FORECAST_LINE_KEYS.retainer)
  return def?.mappingLogicRef ?? "buildClientLevelRevenueLines#client_monthlyretainer"
}

export function fyMonthsForRetainer(fy: number): string[] {
  return billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
}
