import "server-only"

import { getAsOfDate } from "@/lib/pacing/maths"
import {
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache"
import {
  buildDigestCampaignRows,
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
    lineItemStatus: "on-track" | "ahead" | "behind" | "no-data"
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
}

/**
 * Build digest from the same cached adapters the pacing tabs use
 * (`getCached*PacingRows`, 4h TTL). Scope = all clients (admin/cron).
 */
export async function buildPacingDigest(now: Date = new Date()): Promise<PacingDigestPayload> {
  const asOfDate = getAsOfDate(now)
  const allowedClientSlugs = null

  // Ad-serving rows use a different status vocabulary (serving|no-data) and
  // lack spend pacing fields — excluded so we don't invent banding.
  const [search, social, programmatic] = await Promise.all([
    getCachedSearchPacingRows(asOfDate, allowedClientSlugs),
    getCachedSocialPacingRows(asOfDate, allowedClientSlugs),
    getCachedProgrammaticPacingRows(asOfDate, allowedClientSlugs),
  ])

  const sources: DigestSourceRow[] = [
    ...(search ?? []).map((r) => asSource("search", r)),
    ...(social ?? []).map((r) => asSource("social", r)),
    ...(programmatic ?? []).map((r) => asSource("programmatic", r)),
  ]

  const rows = buildDigestCampaignRows(sources, asOfDate)
  const groups = groupDigestByBand(rows)
  const atRisk = groups["at-risk"]

  return {
    asOfDate,
    builtAt: now.toISOString(),
    cacheNote: "Reads may hit pacingRowsCache (4h revalidate); fine for digest if ≤ TTL.",
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
  }
}
