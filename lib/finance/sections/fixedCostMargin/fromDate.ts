/**
 * Fixed cost margin by the fixed cost from date (B31, decision FC9 option C).
 *
 * The switch `fixed_cost_margin_from_date` counts only with
 * `fixed_cost_from_date` and `fixed_cost_report_net` on too (registry
 * `requires`, checked here like `combineFixedCostFromDate`).
 *
 * Pure: the page, the Excel export and the loader share it.
 */

export const FIXED_COST_MARGIN_FROM_DATE_KEY = "fixed_cost_margin_from_date" as const

/** All three switches must be on. Anything else is off (today's report). */
export function combineFixedCostMarginFromDate(marginOn: boolean, dateOn: boolean, netOn: boolean): boolean {
  return marginOn === true && dateOn === true && netOn === true
}
