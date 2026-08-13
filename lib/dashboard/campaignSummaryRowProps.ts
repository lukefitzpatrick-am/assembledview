import type { CampaignSummarySectionProps } from "@/components/dashboard/campaign/CampaignSummaryRow"

export type CampaignSummaryRowInput = {
  isUnfiltered: boolean
  budget: number
  actualSpend?: number
  expectedSpend: number
  totalPlannedSpend: number
  deliveredImpressions?: number
  hasDelivery: boolean
  deliveredAsOf?: string
  time: {
    timeElapsedPct: number
    daysInCampaign: number
    daysElapsed: number
    daysRemaining: number
  }
  /** Full-campaign flight when unfiltered; selected window when filtered. */
  axisStartYmd: string
  axisEndYmd: string
}

/**
 * Summary-row props. Budget is always the full-campaign figure.
 * Spend / delivered / axis dates are whatever the caller already resolved for the window.
 */
export function buildCampaignSummaryRowProps(
  input: CampaignSummaryRowInput,
): CampaignSummarySectionProps {
  return {
    time: {
      ...input.time,
      startDate: input.axisStartYmd,
      endDate: input.axisEndYmd,
    },
    spend: {
      budget: input.budget,
      actualSpend: input.actualSpend,
      expectedSpend: input.expectedSpend,
      totalPlannedSpend: input.totalPlannedSpend,
    },
    delivered: {
      impressions: input.deliveredImpressions,
      hasDelivery: input.hasDelivery,
      asOf: input.deliveredAsOf,
    },
  }
}
