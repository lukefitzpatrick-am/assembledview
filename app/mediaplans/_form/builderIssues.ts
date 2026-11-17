/**
 * The plan form's builder issues list (both pages; B52, S33 A). The S1
 * publish check lists here, one entry per problem. Order is the rail order.
 */
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import type { PanelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"
import { formatMoney } from "@/lib/format/money"
import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"
import { burstOverlapBuilderIssues, type BurstOverlapLine } from "@/lib/mediaplan/burstOverlapLines"
import { missingBurstDatesBuilderIssues } from "@/lib/mediaplan/missingBurstDatesGate"
import { missingBuyTypeBuilderIssues } from "@/lib/mediaplan/missingBuyTypeGate"
import { publisherGuardBuilderIssues } from "@/lib/mediaplan/publisherGuard"
import { publishValidationBuilderIssues } from "@/lib/mediaplan/publishValidation"
import { pushFinanceBuilderIssues } from "@/lib/mediaplan/pushFinanceBuilderIssues"

import type { PlanPublishCheck } from "./publishValidation"

export type PlanBuilderIssuesInput = {
  mode: "create" | "edit"
  clientName: unknown
  campaignName: unknown
  dateWarning: { hasViolation: boolean; offendingCount: number }
  budgetRemainingOverspend: boolean
  budgetRemaining: number
  /**
   * Finance checks. Null: not yet (edit, until every channel has loaded: a
   * partial load can self-match as billable equals MBA).
   */
  finance: { financials: CampaignFinancials; panelIndicators: PanelIndicatorsFromCampaignFinancials } | null
  mbaScopeTotals: { adServing: number; production: number }
  missingPublisherKpiCount: number
  missingBuyTypeLineIds: string[]
  missingBurstDateLineIds: string[]
  burstOverlapLines: readonly BurstOverlapLine[]
  publisherGuard: {
    blocked: Parameters<typeof publisherGuardBuilderIssues>[0]
    warnings: Parameters<typeof publisherGuardBuilderIssues>[1]
  }
  aaPublishWarnings: readonly string[]
  /** S1: the last publish check (or the server's refusal), one entry per problem. */
  publishCheck: PlanPublishCheck
}

/** The dates detail differs by page: create names the channel cards. */
const DATES_DETAIL: Record<PlanBuilderIssuesInput["mode"], string> = {
  create: "Open the channel cards and adjust burst dates, or widen campaign dates.",
  edit: "Adjust burst dates or campaign dates.",
}

export function buildPlanBuilderIssues(input: PlanBuilderIssuesInput): BuilderIssue[] {
  const issues: BuilderIssue[] = []
  if (!String(input.clientName ?? "").trim()) {
    issues.push({
      id: "required-client",
      severity: "error",
      title: "Client name is required",
      stepLabel: "Campaign setup",
      fieldLabel: "Client name",
      scrollTargetId: "builder-section-campaign",
    })
  }
  if (!String(input.campaignName ?? "").trim()) {
    issues.push({
      id: "required-campaign-name",
      severity: "error",
      title: "Campaign name is required",
      stepLabel: "Campaign setup",
      fieldLabel: "Campaign name",
      scrollTargetId: "builder-section-campaign",
    })
  }
  if (input.dateWarning.hasViolation) {
    issues.push({
      id: "dates-outside-window",
      severity: "warning",
      title:
        input.dateWarning.offendingCount === 1
          ? "1 line item has flight dates outside the campaign window"
          : `${input.dateWarning.offendingCount} line items have flight dates outside the campaign window`,
      detail: DATES_DETAIL[input.mode],
      stepLabel: "Campaign setup",
      fieldLabel: "Campaign dates",
      scrollTargetId: "builder-field-campaign-dates",
    })
  }
  if (input.budgetRemainingOverspend) {
    issues.push({
      id: "budget-overspend",
      severity: "warning",
      title: "Budget remaining is negative",
      detail: `${formatMoney(input.budgetRemaining)} over the campaign budget.`,
      stepLabel: "Campaign setup",
      fieldLabel: "Campaign budget",
      scrollTargetId: "builder-field-campaign-budget",
    })
  }
  if (input.finance) pushFinanceBuilderIssues(issues, input.finance.financials, input.finance.panelIndicators)
  if (input.mbaScopeTotals.adServing > 0 || input.mbaScopeTotals.production > 0) {
    issues.push({
      id: "adserving-unvalidated",
      severity: "warning",
      title: "Ad serving / production not auto-checked",
      detail: "These aren't included in the save equality check — confirm their monthly amounts before billing.",
      stepLabel: "MBA & billing",
      fieldLabel: "Ad serving / production",
      scrollTargetId: "mba-billing",
    })
  }
  if (input.missingPublisherKpiCount > 0) {
    issues.push({
      id: "missing-publisher-kpi",
      severity: "warning",
      title: `${input.missingPublisherKpiCount} missing publisher KPI`,
      detail: "Does not block save — open KPIs to add publisher coverage.",
      stepLabel: "KPIs",
      fieldLabel: "Publisher KPI",
      scrollTargetId: "builder-section-kpis",
    })
  }
  issues.push(...missingBuyTypeBuilderIssues(input.missingBuyTypeLineIds))
  issues.push(...missingBurstDatesBuilderIssues(input.missingBurstDateLineIds))
  // A line S1 lists for overlapping bursts shows once, as S1's entry.
  const s1Overlap = new Set(
    input.publishCheck.result.refuse.filter((p) => p.rule === "bursts_overlap").map((p) => p.lineItemId)
  )
  issues.push(...burstOverlapBuilderIssues(input.burstOverlapLines.filter((l) => !s1Overlap.has(l.lineLabel))))
  issues.push(...publisherGuardBuilderIssues(input.publisherGuard.blocked, input.publisherGuard.warnings))
  issues.push(...publishValidationBuilderIssues(input.publishCheck.result, input.publishCheck.refusing))
  input.aaPublishWarnings.forEach((message, index) => {
    issues.push({
      id: `aa-publish-${index}`,
      severity: "warning",
      title: message,
      detail: "Does not block publish.",
      stepLabel: "Publish",
      fieldLabel: "Advertising Associates",
    })
  })
  return issues
}
