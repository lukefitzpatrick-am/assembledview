/**
 * Ended campaigns stay on the admin pacing lists for a week (Luke, 23 Oct 2026).
 *
 * Before this, the live-only lists (portfolio, admin channel tabs, Overview,
 * digest, Ava `get_pacing_snapshot`) dropped a campaign the morning after its
 * last day. Now an approved or booked campaign that derives to completed, or a
 * campaign stored as "completed", stays listed until
 * `ENDED_CAMPAIGN_LISTED_DAYS` days after its end date, then drops off
 * (stored "completed" added by Luke, 23 Oct 2026).
 *
 * - A listed campaign whose end date is before the view day reads "Ended".
 * - Expected is the full flight (expected maths caps elapsed days at the end),
 *   so ended rows compare delivered to the full planned budget.
 * - Channel tab lines have no current burst once the campaign has ended. Their
 *   status is line spend ÷ line budget on the same bands as in-flight lines.
 * - Cancelled, planned and draft campaigns are never listed.
 */
import { resolveCampaignPhase, sydneyCivilDayFromYmd } from "@/lib/mediaplan/campaignPhase"
import { statusFromExpectedPct, type ExpectedPaceBand } from "@/lib/pacing/status"
import { isLiveCampaignStatus } from "@/lib/types/mediaPlanMaster"

/** Days an ended campaign stays on the admin pacing lists after its end date. */
export const ENDED_CAMPAIGN_LISTED_DAYS = 7

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && ISO_DAY.test(value)
}

function addDaysISO(day: string, days: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + days * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** True when the campaign's end date is before the view day. */
export function campaignEndedBefore(
  endDate: string | null | undefined,
  asOfDate: string,
): boolean {
  const end = typeof endDate === "string" ? endDate.trim().slice(0, 10) : ""
  return isIsoDay(end) && isIsoDay(asOfDate) && end < asOfDate
}

/**
 * A completed campaign (approved or booked past its end date, or stored
 * "completed") that ended before the view day and no more than
 * `ENDED_CAMPAIGN_LISTED_DAYS` days before it.
 */
export function isRecentlyEndedCampaign(
  status: string | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  asOfDate: string,
): boolean {
  if (!isIsoDay(asOfDate) || !campaignEndedBefore(endDate, asOfDate)) return false
  const end = String(endDate).trim().slice(0, 10)
  const phase = resolveCampaignPhase({
    status,
    startDate,
    endDate,
    today: sydneyCivilDayFromYmd(asOfDate),
  })
  if (phase.phase !== "completed") return false
  return asOfDate <= addDaysISO(end, ENDED_CAMPAIGN_LISTED_DAYS)
}

/** Admin pacing list gate: live on the view day, or ended within the last week. */
export function isListedOnAdminPacing(
  status: string | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  asOfDate: string,
): boolean {
  return (
    isLiveCampaignStatus(status, startDate, endDate, asOfDate) ||
    isRecentlyEndedCampaign(status, startDate, endDate, asOfDate)
  )
}

/**
 * Status of a line on an ended campaign: line spend ÷ line budget against the
 * full flight. No budget reads no data.
 */
export function endedLineStatus(spendLineTotal: number, totalLineItemBudget: number): ExpectedPaceBand {
  if (!Number.isFinite(totalLineItemBudget) || totalLineItemBudget <= 0) return "no-data"
  const spend = Number.isFinite(spendLineTotal) ? spendLineTotal : 0
  return statusFromExpectedPct((spend / totalLineItemBudget) * 100)
}
