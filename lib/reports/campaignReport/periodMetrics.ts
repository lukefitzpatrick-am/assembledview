import { cpc, cpm, ctr } from "@/lib/money/rates"
import {
  reportPace,
  type ClientPaceBand,
  type ReportGapReason,
} from "@/lib/reports/campaignReport/reportPace"

/**
 * CPM, CPC and CTR for one window. CTR is a decimal. videoViews3s is null
 * unless the snapshot carried a positive 3-second view count. spendPacePct is
 * delivered media / expected media (a ratio). Null when expected is 0.
 * paceBand is the client label; 115% and above is Ahead.
 */
export type CampaignReportPeriodMetrics = {
  cpm: number | null
  cpc: number | null
  ctr: number | null
  /** Spend on lines with views, divided by those views. Null when there are no views. */
  cpv: number | null
  videoViews3s: number | null
  spendPacePct: number | null
  paceBand: ClientPaceBand | null
  /** Set when spendPacePct is null. The deck chooses the words. */
  paceReason: ReportGapReason | null
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
  const pace = reportPace(
    input.spend,
    typeof expected === "number" && Number.isFinite(expected) ? expected : null,
    true,
  )
  return {
    cpm: cpm(input.spend, input.impressions),
    cpc: cpc(input.spend, input.clicks),
    ctr: ctr(input.clicks, input.impressions),
    cpv: null,
    videoViews3s:
      typeof video === "number" && Number.isFinite(video) && video > 0 ? video : null,
    spendPacePct: pace.spendPacePct,
    paceBand: pace.paceBand,
    paceReason: pace.paceReason,
  }
}

/** Flight-elapsed share of a planned budget. The campaign report does not use this for pace. */
export function expectedMediaAtElapsed(
  plannedBudget: number,
  timeElapsedPct: number | null,
): number | null {
  if (timeElapsedPct == null || !Number.isFinite(timeElapsedPct)) return null
  if (!(plannedBudget > 0)) return 0
  return plannedBudget * timeElapsedPct
}
