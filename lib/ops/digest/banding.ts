import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"
import type {
  DirectCampaignGroup,
  DirectLineItemRow,
} from "@/lib/pacing/direct/types"
import {
  computeCampaignDays,
  computeDaysPassed,
  computeDaysRemaining,
  computeExpectedPct,
  getAsOfDate,
} from "@/lib/pacing/maths"

/**
 * Existing app banding (from computeStatus → lineItemStatus pills).
 * Proposed 110/90/75 delivered÷elapsed bands are NOT used — that would invent
 * thresholds; hard-stop rules say reuse existing.
 *
 * Mapping from maths PacingStatus → pill (already done in fetchers):
 *   ahead: slightly_over | over_pacing
 *   on-track: on_track | completed
 *   behind: slightly_under | under_pacing | no_delivery  ← digest "at-risk"
 *   no-data: not_started | unknown | no current burst
 */
export type DigestBand = "ahead" | "on" | "behind" | "at-risk" | "no-data"

export type DigestSourceRow = {
  channel: string
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
}

export type DigestCampaignRow = {
  clientName: string
  mbaNumber: string
  campaignName: string
  channel: string
  band: DigestBand
  deliveredPct: number | null
  timeElapsedPct: number | null
  daysLeft: number | null
  lineItemCount: number
}

/** Map fetcher pill → digest band. `behind` surfaces as at-risk in the top section. */
export function pillToDigestBand(
  status: DigestSourceRow["lineItemStatus"],
): DigestBand {
  if (status === "ahead") return "ahead"
  if (status === "on-track") return "on"
  if (status === "behind") return "at-risk"
  return "no-data"
}

/**
 * Direct fixed-cost status → digest band. Reuses existing alert semantics;
 * does not invent delivered÷elapsed thresholds.
 *
 * `mixed` is resolved by callers via burst statuses + `worstBand` (see
 * `bandForDirectLineItem`). This mapper returns `no-data` for bare `mixed`.
 */
export function directStatusToDigestBand(
  status: DirectLineItemRow["lineItemStatus"],
): DigestBand {
  if (status === "completed_under") return "at-risk"
  if (status === "completed_over") return "ahead"
  if (status === "in_progress" || status === "completed") return "on"
  if (status === "pending") return "no-data"
  // mixed without burst context — row builders resolve via bursts.
  return "no-data"
}

/**
 * Ad-serving (CM360) rows can never be at-risk / ahead / behind — that is
 * correct (zero-spend law; no spend pacing signal). Status is delivery
 * presence only: serving → on, no-data → no-data.
 */
export function adServingStatusToDigestBand(
  status: "serving" | "no-data",
): DigestBand {
  if (status === "serving") return "on"
  return "no-data"
}

export function bandSortKey(band: DigestBand): number {
  switch (band) {
    case "at-risk":
      return 0
    case "behind":
      return 1
    case "no-data":
      return 2
    case "on":
      return 3
    case "ahead":
      return 4
    default:
      return 5
  }
}

function worstBand(a: DigestBand, b: DigestBand): DigestBand {
  return bandSortKey(a) <= bandSortKey(b) ? a : b
}

function bandForDirectLineItem(line: DirectLineItemRow): DigestBand {
  if (line.lineItemStatus !== "mixed") {
    return directStatusToDigestBand(line.lineItemStatus)
  }
  if (line.bursts.length === 0) return "no-data"
  let band = directStatusToDigestBand(line.bursts[0]!.status)
  for (let i = 1; i < line.bursts.length; i++) {
    band = worstBand(band, directStatusToDigestBand(line.bursts[i]!.status))
  }
  return band
}

function pickDirectLineDates(
  line: DirectLineItemRow,
  asOfDate: string,
): { start: string | null; end: string | null } {
  const current =
    line.bursts.find((b) => b.status === "in_progress") ??
    line.bursts.find((b) => b.startDate <= asOfDate && asOfDate <= b.endDate)
  if (current) return { start: current.startDate, end: current.endDate }
  if (line.bursts.length === 0) return { start: null, end: null }
  const starts = line.bursts.map((b) => b.startDate).toSorted()
  const ends = line.bursts.map((b) => b.endDate).toSorted()
  return { start: starts[0] ?? null, end: ends[ends.length - 1] ?? null }
}

function timeMetricsFromDates(
  start: string | null,
  end: string | null,
  asOfDate: string,
): { timeElapsedPct: number | null; daysLeft: number | null } {
  if (!start || !end) return { timeElapsedPct: null, daysLeft: null }
  const campaignDays = computeCampaignDays(start, end)
  const daysPassed = computeDaysPassed(start, end, asOfDate)
  return {
    timeElapsedPct: computeExpectedPct(daysPassed, campaignDays),
    daysLeft: computeDaysRemaining(start, end, asOfDate),
  }
}

function sortDigestRows(rows: DigestCampaignRow[]): DigestCampaignRow[] {
  return rows.sort((a, b) => {
    const bandDiff = bandSortKey(a.band) - bandSortKey(b.band)
    if (bandDiff !== 0) return bandDiff
    return (
      a.clientName.localeCompare(b.clientName) ||
      a.mbaNumber.localeCompare(b.mbaNumber)
    )
  })
}

/**
 * Direct (fixed-cost) groups → campaign-grain digest rows.
 * deliveredPct = platform actual ÷ budget (not finance-smoothed reported).
 */
export function buildDirectDigestCampaignRows(
  groups: DirectCampaignGroup[],
  asOfDate: string = getAsOfDate(),
): DigestCampaignRow[] {
  const rows: DigestCampaignRow[] = []

  for (const group of groups) {
    if (group.lineItems.length === 0) continue

    let band = bandForDirectLineItem(group.lineItems[0]!)
    let timeElapsedSum = 0
    let timeElapsedN = 0
    let daysLeftMin: number | null = null

    for (const line of group.lineItems) {
      band = worstBand(band, bandForDirectLineItem(line))
      const { start, end } = pickDirectLineDates(line, asOfDate)
      const metrics = timeMetricsFromDates(start, end, asOfDate)
      if (metrics.timeElapsedPct != null) {
        timeElapsedSum += metrics.timeElapsedPct
        timeElapsedN += 1
      }
      if (metrics.daysLeft != null) {
        daysLeftMin =
          daysLeftMin == null
            ? metrics.daysLeft
            : Math.min(daysLeftMin, metrics.daysLeft)
      }
    }

    rows.push({
      clientName: group.clientName,
      mbaNumber: group.mbaNumber,
      campaignName: group.campaignName,
      channel: "direct",
      band,
      deliveredPct:
        group.totalBudget > 0 ? group.totalActual / group.totalBudget : null,
      timeElapsedPct:
        timeElapsedN > 0 ? timeElapsedSum / timeElapsedN : null,
      daysLeft: daysLeftMin,
      lineItemCount: group.lineItems.length,
    })
  }

  return sortDigestRows(rows)
}

/**
 * Ad-serving (CM360) line rows → campaign-grain digest rows.
 * deliveredPct = average deliverableProgress over lines where non-null.
 */
export function buildAdServingDigestCampaignRows(
  sources: AdServingPacingCampaignRow[],
  asOfDate: string = getAsOfDate(),
): DigestCampaignRow[] {
  type Acc = {
    clientName: string
    mbaNumber: string
    campaignName: string
    band: DigestBand
    progressSum: number
    progressN: number
    timeElapsedSum: number
    timeElapsedN: number
    daysLeftMin: number | null
    lineItemCount: number
  }

  const map = new Map<string, Acc>()

  for (const row of sources) {
    const band = adServingStatusToDigestBand(row.lineItemStatus)
    const start = row.currentBurst?.startDate ?? row.lineItemStartDate
    const end = row.currentBurst?.endDate ?? row.lineItemEndDate
    const metrics = timeMetricsFromDates(start, end, asOfDate)
    const key = `${row.mbaNumber}::${row.campaignName}::ad-serving`.toLowerCase()

    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        clientName: row.clientName,
        mbaNumber: row.mbaNumber,
        campaignName: row.campaignName,
        band,
        progressSum: row.deliverableProgress ?? 0,
        progressN: row.deliverableProgress != null ? 1 : 0,
        timeElapsedSum: metrics.timeElapsedPct ?? 0,
        timeElapsedN: metrics.timeElapsedPct != null ? 1 : 0,
        daysLeftMin: metrics.daysLeft,
        lineItemCount: 1,
      })
      continue
    }

    existing.band = worstBand(existing.band, band)
    if (row.deliverableProgress != null) {
      existing.progressSum += row.deliverableProgress
      existing.progressN += 1
    }
    if (metrics.timeElapsedPct != null) {
      existing.timeElapsedSum += metrics.timeElapsedPct
      existing.timeElapsedN += 1
    }
    if (metrics.daysLeft != null) {
      existing.daysLeftMin =
        existing.daysLeftMin == null
          ? metrics.daysLeft
          : Math.min(existing.daysLeftMin, metrics.daysLeft)
    }
    existing.lineItemCount += 1
  }

  const rows: DigestCampaignRow[] = []
  for (const acc of map.values()) {
    rows.push({
      clientName: acc.clientName,
      mbaNumber: acc.mbaNumber,
      campaignName: acc.campaignName,
      channel: "ad-serving",
      band: acc.band,
      deliveredPct:
        acc.progressN > 0 ? acc.progressSum / acc.progressN : null,
      timeElapsedPct:
        acc.timeElapsedN > 0 ? acc.timeElapsedSum / acc.timeElapsedN : null,
      daysLeft: acc.daysLeftMin,
      lineItemCount: acc.lineItemCount,
    })
  }

  return sortDigestRows(rows)
}

export function metricsForSourceRow(
  row: DigestSourceRow,
  asOfDate: string,
): {
  deliveredPct: number | null
  timeElapsedPct: number | null
  daysLeft: number | null
} {
  const burst = row.currentBurst
  const budget = burst?.budget ?? row.totalLineItemBudget
  const spend = burst ? row.spendToDateCurrentBurst : row.spendToDateLineTotal
  const deliveredPct = budget > 0 ? spend / budget : null

  const start = burst?.startDate ?? row.lineItemStartDate
  const end = burst?.endDate ?? row.lineItemEndDate
  if (!start || !end) {
    return {
      deliveredPct,
      timeElapsedPct: null,
      daysLeft: row.burstDaysRemaining,
    }
  }

  const campaignDays = computeCampaignDays(start, end)
  const daysPassed = computeDaysPassed(start, end, asOfDate)
  const timeElapsedPct = computeExpectedPct(daysPassed, campaignDays)
  const daysLeft =
    row.burstDaysRemaining ?? computeDaysRemaining(start, end, asOfDate)

  return { deliveredPct, timeElapsedPct, daysLeft }
}

/**
 * Roll line items up to campaign grain (mba + campaign + channel family).
 * Status = worst line-item band; delivered/elapsed = sum spend / sum budget + avg elapsed.
 */
export function buildDigestCampaignRows(
  sources: DigestSourceRow[],
  asOfDate: string = getAsOfDate(),
): DigestCampaignRow[] {
  type Acc = {
    clientName: string
    mbaNumber: string
    campaignName: string
    channel: string
    band: DigestBand
    spend: number
    budget: number
    timeElapsedSum: number
    timeElapsedN: number
    daysLeftMin: number | null
    lineItemCount: number
  }

  const map = new Map<string, Acc>()

  for (const row of sources) {
    const status = String(row.campaignStatus ?? "").toLowerCase()
    // Fetchers already scope to live plans; keep a soft filter for digests.
    if (status && status !== "live" && status !== "active" && status !== "in progress") {
      // Still include when a current burst is active (live delivery window).
      if (!row.currentBurst) continue
    }

    const band = pillToDigestBand(row.lineItemStatus)
    const metrics = metricsForSourceRow(row, asOfDate)
    const key = `${row.mbaNumber}::${row.campaignName}::${row.channel}`.toLowerCase()
    const budget = row.currentBurst?.budget ?? row.totalLineItemBudget
    const spend = row.currentBurst ? row.spendToDateCurrentBurst : row.spendToDateLineTotal

    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        clientName: row.clientName,
        mbaNumber: row.mbaNumber,
        campaignName: row.campaignName,
        channel: row.channel,
        band,
        spend,
        budget,
        timeElapsedSum: metrics.timeElapsedPct ?? 0,
        timeElapsedN: metrics.timeElapsedPct != null ? 1 : 0,
        daysLeftMin: metrics.daysLeft,
        lineItemCount: 1,
      })
      continue
    }

    existing.band = worstBand(existing.band, band)
    existing.spend += spend
    existing.budget += budget
    if (metrics.timeElapsedPct != null) {
      existing.timeElapsedSum += metrics.timeElapsedPct
      existing.timeElapsedN += 1
    }
    if (metrics.daysLeft != null) {
      existing.daysLeftMin =
        existing.daysLeftMin == null
          ? metrics.daysLeft
          : Math.min(existing.daysLeftMin, metrics.daysLeft)
    }
    existing.lineItemCount += 1
  }

  const rows: DigestCampaignRow[] = []
  for (const acc of map.values()) {
    rows.push({
      clientName: acc.clientName,
      mbaNumber: acc.mbaNumber,
      campaignName: acc.campaignName,
      channel: acc.channel,
      band: acc.band,
      deliveredPct: acc.budget > 0 ? acc.spend / acc.budget : null,
      timeElapsedPct:
        acc.timeElapsedN > 0 ? acc.timeElapsedSum / acc.timeElapsedN : null,
      daysLeft: acc.daysLeftMin,
      lineItemCount: acc.lineItemCount,
    })
  }

  return rows.sort((a, b) => {
    const bandDiff = bandSortKey(a.band) - bandSortKey(b.band)
    if (bandDiff !== 0) return bandDiff
    return a.clientName.localeCompare(b.clientName) || a.mbaNumber.localeCompare(b.mbaNumber)
  })
}

export function groupDigestByBand(rows: DigestCampaignRow[]): Record<DigestBand, DigestCampaignRow[]> {
  const groups: Record<DigestBand, DigestCampaignRow[]> = {
    "at-risk": [],
    behind: [],
    "no-data": [],
    on: [],
    ahead: [],
  }
  for (const row of rows) {
    groups[row.band].push(row)
  }
  return groups
}
