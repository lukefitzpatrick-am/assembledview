import "server-only"

import { getAsOfDate } from "@/lib/pacing/maths"
import { addMelbourneDays } from "@/lib/pacing/relabel/notify"
import { listRelabelDrift, type RelabelDriftFinding } from "@/lib/pacing/relabel/listRelabelDrift"
import {
  listRelabelLogForDay,
  type DeliveryRelabelLogRow,
} from "@/lib/pacing/relabel/repo"
import {
  getCachedAdServingPacingRows,
  getCachedDirectPacingRows,
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache"
import { pacingScopeKey } from "@/lib/pacing/campaigns/pacingRowsCache"
import { readPortfolioSnapshot } from "@/lib/pacing/portfolio/portfolioSnapshotStore"
import {
  buildAdServingDigestCampaignRows,
  buildDigestCampaignRows,
  buildDirectDigestCampaignRows,
  digestRowsFromPortfolioCampaigns,
  bandSortKey,
  groupDigestByBand,
  type DigestCampaignRow,
  type DigestSourceRow,
} from "./banding"

function asSource(
  channel: string,
  row: {
    mbaNumber: string
    clientName: string
    campaignName: string
    campaignStatus: string
    lineItemId: string
    lineItemStatus: "on-track" | "ahead" | "behind" | "over-pacing" | "no-data"
    totalLineItemBudget: number
    spendToDateLineTotal: number
    spendToDateCurrentBurst: number
    burstDaysRemaining: number | null
    lineItemStartDate: string | null
    lineItemEndDate: string | null
    currentBurst: { startDate: string; endDate: string; budget: number } | null
  },
): DigestSourceRow {
  return {
    channel,
    mbaNumber: row.mbaNumber,
    clientName: row.clientName,
    campaignName: row.campaignName,
    campaignStatus: row.campaignStatus,
    lineItemId: row.lineItemId,
    lineItemStatus: row.lineItemStatus,
    totalLineItemBudget: row.totalLineItemBudget,
    spendToDateLineTotal: row.spendToDateLineTotal,
    spendToDateCurrentBurst: row.spendToDateCurrentBurst,
    burstDaysRemaining: row.burstDaysRemaining,
    lineItemStartDate: row.lineItemStartDate,
    lineItemEndDate: row.lineItemEndDate,
    currentBurst: row.currentBurst
      ? {
          startDate: row.currentBurst.startDate,
          endDate: row.currentBurst.endDate,
          budget: row.currentBurst.budget,
        }
      : null,
  }
}

export type PacingDigestPayload = {
  asOfDate: string
  builtAt: string
  /** May be served from the 4h pacingRowsCache — acceptable while staleness ≤ TTL. */
  cacheNote: string
  rows: DigestCampaignRow[]
  atRisk: DigestCampaignRow[]
  groups: ReturnType<typeof groupDigestByBand>
  counts: { atRisk: number; behind: number; on: number; ahead: number; noData: number; total: number }
  relabels?: {
    day: string
    events: DeliveryRelabelLogRow[]
    drift: RelabelDriftFinding[]
  }
}

function logDigestStage(
  stage: string,
  started: number,
  extra?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      event: "pacing_digest_stage",
      stage,
      ms: Date.now() - started,
      ...extra,
    }),
  )
}

/**
 * Prefer the same-day admin portfolio snapshot (`scope_key` all, live only).
 * Recompute from the channel caches only when that row is missing.
 */
export async function buildPacingDigest(now: Date = new Date()): Promise<PacingDigestPayload> {
  const asOfDate = getAsOfDate(now)
  const allowedClientSlugs = null
  const snapshotStarted = Date.now()
  const snapshot = await readPortfolioSnapshot({
    asOfDate,
    scopeKey: pacingScopeKey(null),
    liveOnly: true,
  })
  logDigestStage("snapshot_read", snapshotStarted, {
    hit: snapshot != null,
    asOfDate,
    campaigns: snapshot?.rows.length ?? 0,
  })

  if (snapshot && snapshot.asOfDate === asOfDate) {
    const mapStarted = Date.now()
    const rows = digestRowsFromPortfolioCampaigns(snapshot.rows)
    logDigestStage("snapshot_rows", mapStarted, { campaigns: rows.length })
    return finishDigest(now, asOfDate, rows, {
      cacheNote: `Same-day admin portfolio snapshot generated ${snapshot.generatedAt}.`,
    })
  }

  // Direct + ad-serving use distinct status vocabularies; mapped into the
  // existing DigestBand scheme (no new thresholds). Cached getters exist for
  // both — same 4h pacingRowsCache as search/social/programmatic.
  const cacheStarted = Date.now()
  const [search, social, programmatic, direct, adServing] = await Promise.all([
    getCachedSearchPacingRows(asOfDate, allowedClientSlugs),
    getCachedSocialPacingRows(asOfDate, allowedClientSlugs),
    getCachedProgrammaticPacingRows(asOfDate, allowedClientSlugs),
    getCachedDirectPacingRows(asOfDate, allowedClientSlugs, false),
    getCachedAdServingPacingRows(asOfDate, allowedClientSlugs),
  ])
  logDigestStage("channel_caches", cacheStarted)

  const sources: DigestSourceRow[] = [
    ...(search ?? []).map((r) => asSource("search", r)),
    ...(social ?? []).map((r) => asSource("social", r)),
    ...(programmatic ?? []).map((r) => asSource("programmatic", r)),
  ]

  const recomputeStarted = Date.now()
  const rows = [
    ...buildDigestCampaignRows(sources, asOfDate),
    ...buildDirectDigestCampaignRows(direct ?? [], asOfDate),
    ...buildAdServingDigestCampaignRows(adServing ?? [], asOfDate),
  ].sort((a, b) => {
    const bandDiff = bandSortKey(a.band) - bandSortKey(b.band)
    if (bandDiff !== 0) return bandDiff
    return (
      a.clientName.localeCompare(b.clientName) ||
      a.mbaNumber.localeCompare(b.mbaNumber)
    )
  })
  logDigestStage("recompute_rows", recomputeStarted, { campaigns: rows.length })
  return finishDigest(now, asOfDate, rows, {
    cacheNote: "Reads may hit pacingRowsCache (4h revalidate); fine for digest if ≤ TTL.",
  })
}

async function finishDigest(
  now: Date,
  asOfDate: string,
  rows: DigestCampaignRow[],
  meta: { cacheNote: string },
): Promise<PacingDigestPayload> {
  const groups = groupDigestByBand(rows)
  const atRisk = groups["at-risk"]
  const relabelDay = addMelbourneDays(asOfDate, -1)
  let relabelEvents: DeliveryRelabelLogRow[] = []
  let relabelDrift: RelabelDriftFinding[] = []
  const relabelStarted = Date.now()
  try {
    relabelEvents = await listRelabelLogForDay(relabelDay)
  } catch (err) {
    console.error("[pacing-digest] relabel log failed", err)
  }
  try {
    relabelDrift = await listRelabelDrift()
  } catch (err) {
    console.error("[pacing-digest] relabel drift failed", err)
  }
  logDigestStage("relabels", relabelStarted, {
    events: relabelEvents.length,
    drift: relabelDrift.length,
  })

  return {
    asOfDate,
    builtAt: now.toISOString(),
    cacheNote: meta.cacheNote,
    rows,
    atRisk,
    groups,
    counts: {
      atRisk: atRisk.length,
      behind: groups.behind.length,
      on: groups.on.length,
      ahead: groups.ahead.length,
      noData: groups["no-data"].length,
      total: rows.length,
    },
    relabels: {
      day: relabelDay,
      events: relabelEvents,
      drift: relabelDrift,
    },
  }
}
