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
 * cards). The former "Total spend" tile is relabelled "Planned to date" so it is never read as
 * an actuals/delivered figure.
 *
 * TODO(Task 3 — Delivered tile): once a real Snowflake-backed "delivered" read exists on this
 * branch, add a parallel `computeDeliveredTotals` (or extend this module) and surface a
 * `deliveredToDate` figure on a new "Delivered" KPI tile. Option A (both tiles on the delivered
 * basis) becomes viable at that point — do not conflate delivered with planned here in the
 * meantime; the entire point of "Planned to date" is that it is NOT a delivered/actuals number.
 */

/** Client-safe mirror of `isBookedApprovedCompleted` (`lib/api/dashboard/shared.ts`).
 * Commercial inclusion only (booked|approved|completed) — not tip picking.
 * Tip resolution lives in `resolveDashboardLiveVersionRow` on the server aggregation path.
 * Duplicated rather than imported: `shared.ts` pulls in the server-only Xano axios client
 * (reads the Xano API key from env), so importing it from a "use client" component risks
 * bundling server credentials into the client bundle. Keep this predicate in sync with
 * `lib/api/dashboard/shared.ts#isBookedApprovedCompleted`. */
export function isPlannedBasisCampaignStatus(status: string | null | undefined): boolean {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : ""
  return normalized === "booked" || normalized === "approved" || normalized === "completed"
}

export type PlannedBasisCampaign = {
  /** Normalized campaign status (already lowercase/trimmed server-side via `normalizeStatus`). */
  rawStatus: string | null | undefined
  /** Per-campaign planned spend to date (expected-spend-to-date, or full budget once completed). */
  spentAmount: number | null
  totalBudget: number
}

export type PlannedSpendTotals = {
  /** Sum of `spentAmount` across the booked/approved/completed campaign set — "Planned to date". */
  plannedToDate: number
  /** Sum of `totalBudget` across the SAME campaign set — the denominator for `budgetUtilizedPct`. */
  plannedBudget: number
  /** `plannedToDate / plannedBudget * 100`, so this figure and `plannedToDate` always reconcile. */
  budgetUtilizedPct: number
}

/**
 * Sums `spentAmount` / `totalBudget` over the SAME booked/approved/completed campaign subset,
 * so the "Planned to date" tile and the "Budget utilized" tile can never disagree — the
 * percentage is always exactly `plannedToDate / plannedBudget` for the numbers shown.
 */
export function computePlannedSpendTotals(campaigns: PlannedBasisCampaign[]): PlannedSpendTotals {
  const inScope = campaigns.filter((campaign) => isPlannedBasisCampaignStatus(campaign.rawStatus))
  const plannedToDate = inScope.reduce((sum, campaign) => sum + (campaign.spentAmount ?? 0), 0)
  const plannedBudget = inScope.reduce((sum, campaign) => sum + campaign.totalBudget, 0)
  const budgetUtilizedPct = plannedBudget > 0 ? (plannedToDate / plannedBudget) * 100 : 0
  return { plannedToDate, plannedBudget, budgetUtilizedPct }
}
