import "server-only"

import { discardHungPostgresClient } from "@/db"
import { readPublishedOrLivePlanVersions } from "@/lib/data/readMediaPlans"
import { fetchAdServingPacingCampaignRows } from "@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows"
import { fetchSearchPacingCampaignRows } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows"
import {
  getCachedAdServingPacingRows,
  getCachedDirectPacingRows,
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache"
import { fetchDirectPacingRows } from "@/lib/pacing/direct/fetchDirectPacingRows"
import { fetchProgrammaticPacingCampaignRows } from "@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows"
import { fetchSocialPacingCampaignRows } from "@/lib/pacing/social/fetchSocialPacingCampaignRows"
import {
  assembleCampaignPacingRows,
  countPortfolioRows,
} from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import {
  completePortfolioSourceTimings,
  loadBoundedSource,
  loadPortfolioChannelSources,
  PORTFOLIO_OVERALL_BUDGET_MS,
  PORTFOLIO_SOURCE_TIMEOUT_MS,
  type PortfolioSourceTiming,
} from "@/lib/pacing/portfolio/loadPortfolioChannelSources"
import type { CampaignPacingRow, CampaignScheduleInput } from "@/lib/pacing/portfolio/types"
import { isLiveCampaignStatus } from "@/lib/types/mediaPlanMaster"

export type BuildCampaignPacingRowsArgs = {
  asOfDate: string
  allowedClientSlugs: Set<string> | null
  liveOnly?: boolean
  /** Request start. The overall budget is measured from here. */
  startedAt?: number
  overallBudgetMs?: number
  perSourceTimeoutMs?: number
}

function logPortfolioSourceTiming(startedAt: number, sources: PortfolioSourceTiming[]): void {
  console.log(
    JSON.stringify({
      event: "pacing_portfolio_source_timing",
      durationMs: Date.now() - startedAt,
      sources: completePortfolioSourceTimings(sources),
    }),
  )
}

/**
 * First call uses the 4h cache. The retry calls `fetch*` so it does not join
 * the in-flight `unstable_cache` promise. Production Snowflake is serverless:
 * that fetch opens a connection and destroys it.
 */
function channelLoader<T>(
  cached: (asOfDate: string, slugs: Set<string> | null) => Promise<T>,
  fresh: (asOfDate: string, slugs: Set<string> | null) => Promise<T>,
): (asOfDate: string, slugs: Set<string> | null) => Promise<T> {
  let attempt = 0
  return (asOfDate, slugs) => {
    attempt += 1
    return attempt === 1 ? cached(asOfDate, slugs) : fresh(asOfDate, slugs)
  }
}

/** Second versions read drops the postgres.js client so the hung checkout is not reused. */
function versionsWithFreshClient(asOfDate: string): () => Promise<Record<string, unknown>[]> {
  let attempt = 0
  return async () => {
    attempt += 1
    if (attempt > 1) await discardHungPostgresClient()
    return readPublishedOrLivePlanVersions(asOfDate)
  }
}

function normMba(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function scheduleFromVersion(row: Record<string, unknown>): CampaignScheduleInput {
  const budgetRaw = row.mp_campaignbudget
  const campaignBudget =
    typeof budgetRaw === "number" && Number.isFinite(budgetRaw) && budgetRaw > 0
      ? budgetRaw
      : undefined
  return {
    billingSchedule: row.billingSchedule,
    deliverySchedule: row.deliverySchedule,
    campaignBudget,
  }
}

/**
 * Distinct campaign ids from the versions read that pass the builder's live gate
 * (`isLiveCampaignStatus` on the version row's status and dates).
 */
export function liveCampaignIdsFromVersions(
  versions: Record<string, unknown>[],
  asOfDate: string,
): string[] {
  const seen = new Map<string, string>()
  for (const row of versions) {
    const mba = String(row.mba_number ?? "").trim()
    const key = normMba(mba)
    if (!key) continue
    const status = row.campaign_status == null ? null : String(row.campaign_status)
    const start = row.campaign_start_date == null ? null : String(row.campaign_start_date)
    const end = row.campaign_end_date == null ? null : String(row.campaign_end_date)
    if (!isLiveCampaignStatus(status, start, end, asOfDate)) continue
    if (!seen.has(key)) seen.set(key, mba)
  }
  return [...seen.values()]
}

/** Keys `${mba}:${versionNumber}` plus mba-only for published_at rows (never max vn). */
export function schedulesByMbaFromVersions(
  versions: Record<string, unknown>[],
): Map<string, CampaignScheduleInput> {
  const map = new Map<string, CampaignScheduleInput>()
  for (const row of versions) {
    const mba = normMba(row.mba_number)
    if (!mba) continue
    const vn = Number(row.version_number)
    const schedule = scheduleFromVersion(row)
    if (Number.isFinite(vn)) map.set(`${mba}:${vn}`, schedule)
    if (row.published_at) map.set(mba, schedule)
  }
  return map
}

/**
 * One campaign-level pacing row per live campaign, channels nested.
 * Reuses the five cached channel composers — no new Snowflake queries.
 * Campaign expectedToDate is resolveCampaignExpectedSpendToDate (schedule,
 * basis media), including the campaign page's metricsExpectedSpendToDate
 * fallback. Not a straight-line of budget. The stored row shape is unchanged.
 */
export async function buildCampaignPacingRows(
  args: BuildCampaignPacingRowsArgs,
): Promise<{ rows: CampaignPacingRow[]; expectedLiveIds: string[] }> {
  const liveOnly = args.liveOnly !== false
  const startedAt = args.startedAt ?? Date.now()
  const timings: PortfolioSourceTiming[] = []
  const budget = {
    startedAt,
    overallBudgetMs: args.overallBudgetMs ?? PORTFOLIO_OVERALL_BUDGET_MS,
    perSourceTimeoutMs: args.perSourceTimeoutMs ?? PORTFOLIO_SOURCE_TIMEOUT_MS,
    timings,
  }
  let sources
  let versions: Record<string, unknown>[]
  try {
    ;[sources, versions] = await Promise.all([
      loadPortfolioChannelSources(
        { asOfDate: args.asOfDate, allowedClientSlugs: args.allowedClientSlugs },
        {
          search: channelLoader(getCachedSearchPacingRows, (asOfDate, slugs) =>
            fetchSearchPacingCampaignRows({ asOfDate, allowedClientSlugs: slugs }),
          ),
          social: channelLoader(getCachedSocialPacingRows, (asOfDate, slugs) =>
            fetchSocialPacingCampaignRows({ asOfDate, allowedClientSlugs: slugs }),
          ),
          programmatic: channelLoader(getCachedProgrammaticPacingRows, (asOfDate, slugs) =>
            fetchProgrammaticPacingCampaignRows({ asOfDate, allowedClientSlugs: slugs }),
          ),
          adServing: channelLoader(getCachedAdServingPacingRows, (asOfDate, slugs) =>
            fetchAdServingPacingCampaignRows({ asOfDate, allowedClientSlugs: slugs }),
          ),
          direct: channelLoader(
            (asOfDate, slugs) => getCachedDirectPacingRows(asOfDate, slugs, false),
            (asOfDate, slugs) =>
              fetchDirectPacingRows({
                asOfDate,
                allowedClientSlugs: slugs,
                includeHistorical: false,
              }),
          ),
        },
        { parallel: true, ...budget },
      ),
      loadBoundedSource("versions", versionsWithFreshClient(args.asOfDate), budget),
    ])
  } catch (err) {
    logPortfolioSourceTiming(startedAt, timings)
    if (err instanceof Error && err.message === "portfolio source timeout: versions") {
      throw new Error("portfolio versions read timed out")
    }
    throw err
  }
  logPortfolioSourceTiming(startedAt, timings)
  if (timings.some((row) => row.source === "versions" && row.timedOut)) {
    throw new Error("portfolio versions read timed out")
  }
  const timedOutSource = timings.find((row) => row.timedOut)
  if (timedOutSource) {
    throw new Error(`portfolio source timeout: ${timedOutSource.source}`)
  }

  const rows = assembleCampaignPacingRows({
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    liveOnly,
    ...sources,
    schedulesByMba: schedulesByMbaFromVersions(versions),
  })
  return {
    rows,
    expectedLiveIds: liveCampaignIdsFromVersions(versions, args.asOfDate),
  }
}

export { assembleCampaignPacingRows, countPortfolioRows }
