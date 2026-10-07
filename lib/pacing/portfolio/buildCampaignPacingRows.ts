import "server-only"

import { readPublishedOrLivePlanVersions } from "@/lib/data/readMediaPlans"
import {
  getCachedAdServingPacingRows,
  getCachedDirectPacingRows,
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache"
import {
  assembleCampaignPacingRows,
  countPortfolioRows,
} from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import {
  loadBoundedSource,
  loadPortfolioChannelSources,
  PORTFOLIO_OVERALL_BUDGET_MS,
  PORTFOLIO_SOURCE_TIMEOUT_MS,
  type PortfolioSourceTiming,
} from "@/lib/pacing/portfolio/loadPortfolioChannelSources"
import type { CampaignScheduleInput } from "@/lib/pacing/portfolio/types"

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
      sources,
    }),
  )
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
 * Campaign expectedToDate is resolveCampaignExpectedSpendToDate (schedule),
 * not a straight-line of budget.
 */
export async function buildCampaignPacingRows(
  args: BuildCampaignPacingRowsArgs,
) {
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
          search: getCachedSearchPacingRows,
          social: getCachedSocialPacingRows,
          programmatic: getCachedProgrammaticPacingRows,
          adServing: getCachedAdServingPacingRows,
          direct: (asOfDate, slugs) => getCachedDirectPacingRows(asOfDate, slugs, false),
        },
        { parallel: true, ...budget },
      ),
      loadBoundedSource("versions", () => readPublishedOrLivePlanVersions(args.asOfDate), budget),
    ])
  } catch (err) {
    logPortfolioSourceTiming(startedAt, timings)
    throw err
  }
  logPortfolioSourceTiming(startedAt, timings)
  if (timings.some((row) => row.source === "versions" && row.timedOut)) {
    throw new Error("portfolio versions read timed out")
  }

  return assembleCampaignPacingRows({
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    liveOnly,
    ...sources,
    schedulesByMba: schedulesByMbaFromVersions(versions),
  })
}

export { assembleCampaignPacingRows, countPortfolioRows }
