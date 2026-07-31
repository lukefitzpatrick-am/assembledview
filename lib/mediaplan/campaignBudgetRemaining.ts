/**
 * Campaign budget remaining — shared create/edit basis.
 *
 * Campaign budget means total investment including fees =
 * `mbaScopeTotals.nettExGst` = grossMedia + fee + adServing + production, ex GST.
 * Never subtract media-only (`grossMedia`) from the campaign budget field.
 *
 * Remaining is rounded to AUD cents (both inputs are already money). That is not
 * an overspend tolerance — a true −$0.33 still reports as overspend.
 */

import { roundMoney2 } from "@/lib/format/money"

export const CAMPAIGN_BUDGET_REMAINING_BASIS_CAPTION = "total investment, ex GST"

export type MbaScopeTotalsForBudget = {
  nettExGst: number
}

/** MBA-scope total investment ex GST — the sole allocated figure for remaining. */
export function totalInvestmentAllocatedFromMbaScope(
  mbaScopeTotals: MbaScopeTotalsForBudget
): number {
  return mbaScopeTotals.nettExGst
}

export function computeCampaignBudgetRemaining(
  campaignBudget: unknown,
  totalInvestmentAllocated: number
): number {
  return roundMoney2((Number(campaignBudget) || 0) - totalInvestmentAllocated)
}

export function isCampaignBudgetOverspend(budgetRemaining: number): boolean {
  return budgetRemaining < 0
}

/** Create-page formula — must match edit for the same plan inputs. */
export function createPageBudgetRemaining(
  campaignBudget: unknown,
  mbaScopeTotals: MbaScopeTotalsForBudget
): number {
  return computeCampaignBudgetRemaining(
    campaignBudget,
    totalInvestmentAllocatedFromMbaScope(mbaScopeTotals)
  )
}

/**
 * Edit-page formula — `totalInvestment` is wired from `mbaScopeTotals.nettExGst`.
 * Pass that same nett figure; do not pass media-only subtotals.
 */
export function editPageBudgetRemaining(
  campaignBudget: unknown,
  totalInvestment: number
): number {
  return computeCampaignBudgetRemaining(campaignBudget, totalInvestment)
}
