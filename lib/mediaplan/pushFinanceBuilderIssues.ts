/**
 * Unified finance signals for the builder-issues checklist (P-A).
 * Reads core CampaignFinancials / panel indicator fields only — no second validation engine.
 */

import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import type { PanelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"
import { formatMoney } from "@/lib/format/money"
import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"

/**
 * Appends finance builder issues in fixed order (mutates `issues` in place).
 */
export function pushFinanceBuilderIssues(
  issues: BuilderIssue[],
  financials: CampaignFinancials,
  panelIndicators: PanelIndicatorsFromCampaignFinancials
): void {
  if (!financials.validation.billableEqualsMba) {
    issues.push({
      id: "billable-not-mba",
      severity: "error",
      title: "Billing doesn't equal the approved MBA",
      detail: `Off by ${formatMoney(Math.abs(financials.validation.deltaExGst))} ex GST. Open MBA & billing → reset to auto, or fix the plan.`,
      scrollTargetId: "mba-billing",
    })
  }
  if (financials.mbaFeeAdjusted) {
    issues.push({
      id: "fee-adjusted",
      severity: "warning",
      title: "Fee adjusted on one or more lines",
      detail: "A manual fee override changes the MBA fee total.",
      scrollTargetId: "mba-billing",
    })
  }
  if (panelIndicators.mbaDetails.partialLabel) {
    issues.push({
      id: "partial-mba",
      severity: "warning",
      title: panelIndicators.mbaDetails.partialLabel,
      detail: "Excluded lines are out of MBA + billing but still in delivery.",
      scrollTargetId: "mba-billing",
    })
  }
}
