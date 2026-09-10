import type { BuyType } from "@/lib/mediaplan/deliverableBudget"

/**
 * Planner Buy Type labels (expert-grid combobox / container display).
 * Media Plan Excel `formatBuyType` looks here first so a union member cannot
 * silently share another type's label via fallthrough.
 */
export const BUY_TYPE_UI_LABELS: Record<BuyType, string> = {
  package: "Package",
  spots: "Spots",
  cpt: "CPT",
  cpp: "CPP",
  panels: "Panels",
  insertions: "Insertions",
  cpm: "CPM",
  cpc: "CPC",
  guaranteed_leads: "Guaranteed Leads",
  screens: "Screens",
  cpcv: "CPCV",
  cpi: "CPI",
  cps: "CPS",
  cpv: "CPV",
  fixed_cost: "Fixed Cost",
  weekly_rate: "Weekly Rate",
  monthly_rate: "Monthly Rate",
  package_inclusions: "Package Inclusions",
  bonus: "Bonus",
  production: "Production",
}

/** Strings that are not `BuyType` but still appear on historic line items. */
const BUY_TYPE_EXPORT_ALIASES: Record<string, string> = {
  cpa: "CPA",
  cpl: "CPL",
  fixed_spot_rate: "Fixed Spot Rate",
  sponsorship: "Sponsorship",
  reach: "Reach",
  frequency: "Frequency",
  cost_per_spot: "Cost Per Spot",
  cost_per_thousand: "Cost Per Thousand",
  cost_per_point: "Cost Per Point",
  cost_per_click: "CPC",
  cost_per_view: "CPV",
  cost_per_acquisition: "CPA",
  cost_per_lead: "CPL",
  cost_per_install: "CPI",
}

const ACRONYM_PATTERN = /^[A-Z]{2,4}$/i

/** Excel Buy Type column. Empty in → empty out. */
export function formatBuyTypeForExport(buyType: string | undefined): string {
  if (!buyType) return ""

  const lowerBuyType = buyType.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(BUY_TYPE_UI_LABELS, lowerBuyType)) {
    return BUY_TYPE_UI_LABELS[lowerBuyType as BuyType]
  }
  if (BUY_TYPE_EXPORT_ALIASES[lowerBuyType]) {
    return BUY_TYPE_EXPORT_ALIASES[lowerBuyType]
  }

  if (ACRONYM_PATTERN.test(buyType)) {
    return buyType.toUpperCase()
  }

  return buyType
    .split("_")
    .map((word) => {
      if (ACRONYM_PATTERN.test(word)) {
        return word.toUpperCase()
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}
