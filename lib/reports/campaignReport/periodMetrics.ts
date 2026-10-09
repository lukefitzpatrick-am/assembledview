import { cpc, cpm, ctr } from "@/lib/money/rates"
import { computeCampaignDays, computeDaysPassed, computeExpectedPct } from "@/lib/pacing/maths"

/**
 * CPM, CPC and CTR for one window. CTR is a decimal. videoViews3s is null
 * unless the snapshot carried a positive 3-second view count. spendPacePct is
 * delivered media / expected media (a ratio). Null when expected is 0.
 */
export type CampaignReportPeriodMetrics = {
  cpm: number | null
  cpc: number | null
  ctr: number | null
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
    videoViews3s:
      typeof video === "number" && Number.isFinite(video) && video > 0 ? video : null,
    spendPacePct:
      typeof expected === "number" && Number.isFinite(expected) && expected !== 0 && Number.isFinite(input.spend)
        ? input.spend / expected
        : null,
  }
}

/**
 * Same expected figure the period summary already shows: media planned budget
 * times the elapsed share of the flight. Null when the flight or the budget
 * is missing. Zero when the flight has not started.
 */
export function expectedMediaToDate(input: {
  plannedBudget: number
  startISO: string | null | undefined
  endISO: string | null | undefined
  asOfISO: string
}): { expectedSpendToDate: number | null; timeElapsedPct: number | null } {
  const { plannedBudget, startISO, endISO, asOfISO } = input
  if (!startISO || !endISO || !(plannedBudget > 0)) {
    return { expectedSpendToDate: null, timeElapsedPct: null }
  }
  const elapsed = computeExpectedPct(
    computeDaysPassed(startISO, endISO, asOfISO),
    computeCampaignDays(startISO, endISO),
  )
  return { expectedSpendToDate: plannedBudget * elapsed, timeElapsedPct: elapsed }
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
