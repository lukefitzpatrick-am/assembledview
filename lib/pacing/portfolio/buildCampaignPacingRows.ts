import "server-only"

import { readPlanVersions } from "@/lib/data/readMediaPlans"
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
import { loadPortfolioChannelSources } from "@/lib/pacing/portfolio/loadPortfolioChannelSources"
import type { CampaignScheduleInput } from "@/lib/pacing/portfolio/types"

export type BuildCampaignPacingRowsArgs = {
  asOfDate: string
  allowedClientSlugs: Set<string> | null
  liveOnly?: boolean
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
  const [sources, versions] = await Promise.all([
    loadPortfolioChannelSources(
      { asOfDate: args.asOfDate, allowedClientSlugs: args.allowedClientSlugs },
      {
        search: getCachedSearchPacingRows,
        social: getCachedSocialPacingRows,
        programmatic: getCachedProgrammaticPacingRows,
        adServing: getCachedAdServingPacingRows,
        direct: (asOfDate, slugs) => getCachedDirectPacingRows(asOfDate, slugs, false),
      },
      { parallel: true }
    ),
    readPlanVersions(),
  ])

  return assembleCampaignPacingRows({
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    liveOnly,
    ...sources,
    schedulesByMba: schedulesByMbaFromVersions(versions),
  })
}

export { assembleCampaignPacingRows, countPortfolioRows }
