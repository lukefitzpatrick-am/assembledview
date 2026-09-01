/**
 * Investment explorer measure catalog — Booked / Actuals (Xero) / Agency economics.
 */

import {
  ACTUALS_MEASURES,
  isActualsMeasure,
  isActualsMeasureAllowed,
  isDimAllowedWithActuals,
} from "./cutGrain"
import {
  AGENCY_ECONOMICS_HISTORIC_CAPTION,
  AGENCY_REVENUE_DIMS,
  isAgencyEconomicsMeasure,
  measuresIncludeAgencyEconomics,
} from "./agencyEconomics"
import { australianFyStartYearForDate } from "@/lib/finance/months"
import type { InvestmentCutDim, InvestmentCutMeasure } from "./cutTypes"

export type MeasureGroupId = "booked" | "actuals" | "agency"

export type MeasureDef = {
  key: InvestmentCutMeasure
  label: string
  group: MeasureGroupId
  groupLabel: string
  /** Short description for tooltips. */
  description: string
}

export const INVESTMENT_MEASURE_DEFS: MeasureDef[] = [
  {
    key: "media_cents",
    label: "Media",
    group: "booked",
    groupLabel: "Booked",
    description: "Booked media cents on the selected basis",
  },
  {
    key: "fee_cents",
    label: "Fee",
    group: "booked",
    groupLabel: "Booked",
    description: "Booked agency fee cents (may be incomplete — see fee coverage)",
  },
  {
    key: "adserving_cents",
    label: "Ad serving",
    group: "booked",
    groupLabel: "Booked",
    description: "Booked ad-serving cents",
  },
  {
    key: "billable_cents",
    label: "Billable",
    group: "booked",
    groupLabel: "Booked",
    description: "FN3a booked billable (media+fee+adserving composition)",
  },
  {
    key: "invoiced_cents",
    label: "Invoiced",
    group: "actuals",
    groupLabel: "Actuals (Xero)",
    description: "Xero AR ex-GST (sub_total) at MBA×month grain",
  },
  {
    key: "paid_cents",
    label: "Paid",
    group: "actuals",
    groupLabel: "Actuals (Xero)",
    description: "Xero AR amount_paid at MBA×month grain (Xero paid figure)",
  },
  {
    key: "invoiced_delta_cents",
    label: "Invoiced Δ",
    group: "actuals",
    groupLabel: "Actuals (Xero)",
    description: "Booked billable − invoiced, both ex-GST (same grain)",
  },
  {
    key: "retainer_cents",
    label: "Retainer",
    group: "agency",
    groupLabel: "Agency economics",
    description:
      "Forecast client monthlyretainer × months in range (buildClientLevelRevenueLines#client_monthlyretainer)",
  },
  {
    key: "sow_cents",
    label: "SOW / PRIP",
    group: "agency",
    groupLabel: "Agency economics",
    description: "Forecast project_scope_prip placeholder (zeros until product fields land)",
  },
  {
    key: "revenue_cents",
    label: "Revenue",
    group: "agency",
    groupLabel: "Agency economics",
    description: "fee + retainer + SOW (adserving excluded pending Luke confirmation)",
  },
  {
    key: "margin_pct",
    label: "Margin %",
    group: "agency",
    groupLabel: "Agency economics",
    description:
      "revenue / billable × 100 (omitted when billable is 0); neutral formatting until RAG confirmed",
  },
]

export const MEASURE_GROUPS: Array<{ id: MeasureGroupId; label: string }> = [
  { id: "booked", label: "Booked" },
  { id: "actuals", label: "Actuals (Xero)" },
  { id: "agency", label: "Agency economics" },
]

export function measureDef(key: InvestmentCutMeasure): MeasureDef {
  return INVESTMENT_MEASURE_DEFS.find((d) => d.key === key)!
}

export function measurePickerState(
  dimensions: readonly InvestmentCutDim[],
  filters?: Parameters<typeof isActualsMeasureAllowed>[1],
  options?: { fy?: number; today?: Date }
): Array<MeasureDef & { disabled: boolean; disabledReason?: string }> {
  const actualsGate = isActualsMeasureAllowed(dimensions, filters)
  const currentFy = australianFyStartYearForDate(options?.today ?? new Date())
  const fy = options?.fy ?? currentFy
  const historicBlocked = fy < currentFy
  const agencyGrain = (() => {
    const allowed = new Set<string>(AGENCY_REVENUE_DIMS)
    const blocked = dimensions.filter((d) => !allowed.has(d))
    if (!blocked.length) return { allowed: true as const }
    return {
      allowed: false as const,
      reason:
        "Agency revenue measures need client / month / FY only — not publisher, channel, or billingAgency (retainer is client-level).",
    }
  })()

  return INVESTMENT_MEASURE_DEFS.map((def) => {
    if (isActualsMeasure(def.key)) {
      return {
        ...def,
        disabled: !actualsGate.allowed,
        disabledReason: actualsGate.reason,
      }
    }
    if (isAgencyEconomicsMeasure(def.key)) {
      if (historicBlocked) {
        return {
          ...def,
          disabled: true,
          disabledReason: AGENCY_ECONOMICS_HISTORIC_CAPTION,
        }
      }
      if (!agencyGrain.allowed) {
        return { ...def, disabled: true, disabledReason: agencyGrain.reason }
      }
      return { ...def, disabled: false }
    }
    return { ...def, disabled: false }
  })
}

export function dimPickerState(
  dim: InvestmentCutDim,
  selectedMeasures: readonly InvestmentCutMeasure[]
): { disabled: boolean; disabledReason?: string } {
  const actualsGate = isDimAllowedWithActuals(dim, selectedMeasures)
  if (!actualsGate.allowed) {
    return { disabled: true, disabledReason: actualsGate.reason }
  }
  if (measuresIncludeAgencyEconomics(selectedMeasures)) {
    const allowed = new Set<string>(AGENCY_REVENUE_DIMS)
    if (!allowed.has(dim)) {
      return {
        disabled: true,
        disabledReason:
          "Agency revenue measures need client / month / FY only — retainer is client-level and is not prorated.",
      }
    }
  }
  return { disabled: false }
}

export { ACTUALS_MEASURES, isActualsMeasure, isAgencyEconomicsMeasure }
