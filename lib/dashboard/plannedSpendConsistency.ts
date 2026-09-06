/**
 * KPI-bar self-consistency (dashboard Task 2).
 *
 * BUG this replaces: "Total spend" (server `clientData.totalSpend` — an FY-windowed
 * delivery-schedule total) and "Budget utilized" (client `Σ spentAmount / Σ totalBudget`,
 * computed over an *unfiltered* campaign set) pulled from two unrelated bases, so the two
 * tiles could show numbers with no arithmetic relationship (e.g. "$55K" next to "85%").
 *
 * Fix (Option B — see `.superpowers/sdd/task-2-brief.md`): both tiles now derive from THIS one
 * computation — the same campaign set (booked / approved / completed, matching the
 * `deliveryScheduleByMBA` filter in `lib/api/dashboard/client.ts`) and the same planned-spend
 * basis (`spentAmount`, the per-campaign expected-spend-to-date figure already used on campaign
 * With a date range (FX-1), Plan committed is elapsed-in-range ÷ planned-in-range:
 * to-date clamps through min(rangeEnd, today); the denominator uses the full window.
 * Clamping both to the same window made the percentage always 100%.
 *
 * TODO(Task 3 — Delivered tile): once a real Snowflake-backed "delivered" read exists on this
 * branch, add a parallel `computeDeliveredTotals` (or extend this module) and surface a
 * `deliveredToDate` figure on a new "Delivered" KPI tile. Option A (both tiles on the delivered
 * basis) becomes viable at that point — do not conflate delivered with planned here in the
 * meantime; the entire point of "Planned to date" is that it is NOT a delivered/actuals number.
 */

import { clampMonthlyAmountsToRange } from "@/lib/dashboard/clientDateRange"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

/** Client-safe mirror of `isBookedApprovedCompleted` (`lib/api/dashboard/shared.ts`).
 * Commercial inclusion only (booked|approved|completed) — not tip picking.
 *
 * Three questions (never the same call):
 *   - which version is live      → publication (`published_at` / resolveDashboardLiveVersionRow)
 *   - does this campaign count   → commercial status (this predicate)
 *   - where is it in time        → resolveCampaignPhase
 *
 * Tip resolution lives in `resolveDashboardLiveVersionRow` on the server aggregation path.
 * Duplicated rather than imported: `shared.ts` pulls in the server-only Xano axios client
 * (reads the Xano API key from env), so importing it from a "use client" component risks
 * bundling server credentials into the client bundle. Keep this predicate in sync with
 * `lib/api/dashboard/shared.ts#isBookedApprovedCompleted`. */
export function isPlannedBasisCampaignStatus(status: string | null | undefined): boolean {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : ""
  return normalized === "booked" || normalized === "approved" || normalized === "completed"
}

export type PlannedMonthAmount = { yearMonth: string; amount: number }

export type PlannedBasisCampaign = {
  /** Normalized campaign status (already lowercase/trimmed server-side via `normalizeStatus`). */
  rawStatus: string | null | undefined
  /** Per-campaign planned spend to date (expected-spend-to-date, or full budget once completed). */
  spentAmount: number | null
  totalBudget: number
  /** Delivery-schedule months; with a range, to-date clamps through today and budget uses the full window. */
  months?: PlannedMonthAmount[]
}

export type PlannedSpendRange = {
  rangeStartISO: string
  rangeEndISO: string
  /** Civil today `YYYY-MM-DD`. Tests inject; production uses Melbourne today. */
  todayISO?: string
}

export type PlannedSpendTotals = {
  /** Elapsed planned dollars (to-date, or in-range through today). "Planned to date". */
  plannedToDate: number
  /** Full planned dollars (campaign budget, or everything planned inside the range). */
  plannedBudget: number
  /** `plannedToDate / plannedBudget * 100` — Plan committed. */
  budgetUtilizedPct: number
}

/**
 * Booked/approved/completed only. Without a range: `spentAmount / totalBudget`.
 * With a range: planned-to-date is months clamped to `[rangeStart, min(rangeEnd, today)]`;
 * planned budget is the same months clamped to `[rangeStart, rangeEnd]`. A range entirely
 * in the past → 100%; entirely in the future → 0%; straddling today → partial.
 */
export function computePlannedSpendTotals(
  campaigns: PlannedBasisCampaign[],
  range?: PlannedSpendRange,
): PlannedSpendTotals {
  const inScope = campaigns.filter((campaign) => isPlannedBasisCampaignStatus(campaign.rawStatus))
  const todayISO = range?.todayISO ?? getMelbourneTodayISO()
  const plannedToDate = inScope.reduce((sum, campaign) => {
    if (range && campaign.months?.length) {
      const toDateEnd = todayISO < range.rangeEndISO ? todayISO : range.rangeEndISO
      return sum + clampMonthlyAmountsToRange(campaign.months, range.rangeStartISO, toDateEnd)
    }
    return sum + (campaign.spentAmount ?? 0)
  }, 0)
  const plannedBudget = inScope.reduce((sum, campaign) => {
    if (range && campaign.months?.length) {
      return sum + clampMonthlyAmountsToRange(campaign.months, range.rangeStartISO, range.rangeEndISO)
    }
    return sum + campaign.totalBudget
  }, 0)
  const budgetUtilizedPct = plannedBudget > 0 ? (plannedToDate / plannedBudget) * 100 : 0
  return { plannedToDate, plannedBudget, budgetUtilizedPct }
}
