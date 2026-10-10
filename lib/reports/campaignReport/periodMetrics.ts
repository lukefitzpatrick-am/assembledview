import { cpc, cpm, ctr } from "@/lib/money/rates"

/**
 * CPM, CPC and CTR for one window. CTR is a decimal. videoViews3s is null
 * unless the snapshot carried a positive 3-second view count. spendPacePct is
 * delivered media / expected media (a ratio). Null when expected is 0.
 */
export type CampaignReportPeriodMetrics = {
  cpm: number | null
  cpc: number | null
  ctr: number | null
  /** Spend on lines with views, divided by those views. Null when there are no views. */
  cpv: number | null
  videoViews3s: number | null
  spendPacePct: number | null
}

export function campaignReportPeriodMetrics(input: {
  spend: number
  impressions: number
  clicks: number
  video3sViews?: number | null
  expectedSpend: number | null
}): CampaignReportPeriodMetrics {
  const video = input.video3sViews
  const expected = input.expectedSpend
  return {
    cpm: cpm(input.spend, input.impressions),
    cpc: cpc(input.spend, input.clicks),
    ctr: ctr(input.clicks, input.impressions),
    cpv: null,
    videoViews3s:
      typeof video === "number" && Number.isFinite(video) && video > 0 ? video : null,
    spendPacePct:
      typeof expected === "number" && Number.isFinite(expected) && expected !== 0 && Number.isFinite(input.spend)
        ? input.spend / expected
        : null,
  }
}

/** Channel expected uses the campaign elapsed share already on the summary. */
export function expectedMediaAtElapsed(
  plannedBudget: number,
  timeElapsedPct: number | null,
): number | null {
  if (timeElapsedPct == null || !Number.isFinite(timeElapsedPct)) return null
  if (!(plannedBudget > 0)) return 0
  return plannedBudget * timeElapsedPct
}
