/**
 * Which live MBAs get a monthly campaign report, and the idempotent queue
 * of those rows. AV-R7 reuses the selection. The cron route owns the query
 * and the insert.
 *
 * Commercial status goes through the finance helpers. A non-blank master
 * `campaign_status` wins (it is the commercial fact). A blank master falls
 * back to the published version. `isApprovedOrBeyond` is the include check,
 * so stored `completed` is included and `cancelled` is not. Campaign dates
 * must overlap the period (inclusive ISO days).
 */

import { isApprovedOrBeyond } from "@/lib/docs/isApprovedOrBeyond"
import { resolveFinanceCampaignStatus } from "@/lib/finance/sections/financeCampaignStatus"
import { normaliseStatus } from "@/lib/mediaplan/campaignStatusGuard"

export const MONTHLY_CAMPAIGN_REPORT_KIND = "monthly_campaign"

export type MonthlyReportPeriod = {
  periodStart: string
  periodEnd: string
}

export type MonthlyReportMbaCandidate = {
  mbaNumber: string
  clientId: number | null
  /** Master commercial status. Blank means use the published version. */
  masterCampaignStatus: string | null
  versionCampaignStatus: string | null
  campaignStart: string | null
  campaignEnd: string | null
}

export type MonthlyReportMba = {
  mbaNumber: string
  clientId: number | null
}

export type QueuedReportRun = {
  kind: typeof MONTHLY_CAMPAIGN_REPORT_KIND
  mbaNumber: string
  clientId: number | null
  periodStart: string
  periodEnd: string
  status: "queued"
}

export type EnqueueMonthlyReportCounts = MonthlyReportPeriod & {
  selected: number
  queued: number
  alreadyPresent: number
}

function civilDay(value: string | null | undefined): string | null {
  if (value == null) return null
  const day = value.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Sydney civil day 4 or 5. The 5th is the retry. */
export function isMonthlyReportEnqueueDay(todayISO: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayISO)
  if (!match) return false
  const day = Number(match[3])
  return day === 4 || day === 5
}

/**
 * Previous Sydney calendar month for a `YYYY-MM-DD` civil date.
 * 4 Jan returns 1 Dec through 31 Dec of the previous year.
 */
export function previousSydneyMonth(todayISO: string): MonthlyReportPeriod {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayISO)
  if (!match) {
    throw new Error(`Expected a Sydney date YYYY-MM-DD, got ${todayISO}`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const lastDay = new Date(Date.UTC(year, month - 1, 0))
  const periodEnd = lastDay.toISOString().slice(0, 10)
  return { periodStart: `${periodEnd.slice(0, 8)}01`, periodEnd }
}

function commercialStatus(candidate: MonthlyReportMbaCandidate): string {
  const master = candidate.masterCampaignStatus?.trim() ?? ""
  if (master) {
    return resolveFinanceCampaignStatus({
      master_campaign_status: master,
      campaign_status: candidate.versionCampaignStatus,
    })
  }
  return resolveFinanceCampaignStatus({
    campaign_status: candidate.versionCampaignStatus,
  })
}

function overlapsPeriod(
  start: string,
  end: string,
  period: MonthlyReportPeriod,
): boolean {
  return start <= period.periodEnd && end >= period.periodStart
}

export function selectMonthlyReportMbas(
  candidates: readonly MonthlyReportMbaCandidate[],
  period: MonthlyReportPeriod,
): MonthlyReportMba[] {
  const chosen: MonthlyReportMba[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const mbaNumber = candidate.mbaNumber.trim()
    if (!mbaNumber || seen.has(mbaNumber)) continue
    const start = civilDay(candidate.campaignStart)
    const end = civilDay(candidate.campaignEnd)
    if (!start || !end) continue
    const status = commercialStatus(candidate)
    if (normaliseStatus(status) === "cancelled") continue
    if (
      !isApprovedOrBeyond(status, {
        startDate: start,
        endDate: end,
      })
    ) {
      continue
    }
    if (!overlapsPeriod(start, end, period)) continue
    seen.add(mbaNumber)
    const clientId =
      typeof candidate.clientId === "number" && Number.isFinite(candidate.clientId)
        ? candidate.clientId
        : null
    chosen.push({ mbaNumber, clientId })
  }
  chosen.sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber))
  return chosen
}

export function queuedReportRuns(
  selected: readonly MonthlyReportMba[],
  period: MonthlyReportPeriod,
): QueuedReportRun[] {
  return selected.map((row) => ({
    kind: MONTHLY_CAMPAIGN_REPORT_KIND,
    mbaNumber: row.mbaNumber,
    clientId: row.clientId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: "queued",
  }))
}

/**
 * Queue one row per selected MBA. `insertQueued` must insert with
 * on conflict do nothing and return how many rows were new.
 */
export async function enqueueMonthlyReportRuns(args: {
  candidates: readonly MonthlyReportMbaCandidate[]
  todayISO: string
  insertQueued: (rows: QueuedReportRun[]) => Promise<number>
}): Promise<EnqueueMonthlyReportCounts> {
  const period = previousSydneyMonth(args.todayISO)
  const selected = selectMonthlyReportMbas(args.candidates, period)
  if (selected.length === 0) {
    return { ...period, selected: 0, queued: 0, alreadyPresent: 0 }
  }
  const queued = await args.insertQueued(queuedReportRuns(selected, period))
  const inserted = Math.max(0, queued)
  return {
    ...period,
    selected: selected.length,
    queued: inserted,
    alreadyPresent: Math.max(0, selected.length - inserted),
  }
}
