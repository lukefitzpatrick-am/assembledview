import type { CampaignPacingRow, PortfolioPace } from "@/lib/pacing/portfolio/types"
import { isOverPacing } from "@/lib/pacing/portfolio/portfolioRowFlags"

function channelLabel(row: CampaignPacingRow, pace: PortfolioPace): string | null {
  const match = row.channels.find((channel) => channel.pace === pace)
  return match?.label ?? null
}

/**
 * One suggested next step from the campaign why / pace rules.
 * Mirrors the Overview "suggested next step" line in the V2 mock.
 */
export function suggestedNextStep(row: CampaignPacingRow): string {
  if (isOverPacing(row)) {
    const hot = channelLabel(row, "ahead") ?? row.channels[0]?.label
    return hot
      ? `Cap ${hot} this week so the current burst does not finish over budget.`
      : "Cap the over-pacing burst this week so the line does not finish over budget."
  }
  if (row.pace === "behind") {
    const slow = channelLabel(row, "behind")
    return slow
      ? `Check ${slow} delivery and the current burst flight — spend is behind time elapsed.`
      : "Check delivery and the current burst flight — spend is behind time elapsed."
  }
  if (row.pace === "no_source") {
    return "Connect the missing delivery source so this campaign can report."
  }
  if (row.pace === "no_delivery") {
    return "Confirm trafficking is live — the window has started and no facts have landed."
  }
  if (row.pace === "not_started") {
    return "Nothing to do until the flight starts."
  }
  if (row.kpi && row.kpi.tracked < row.kpi.total) {
    return "Set the missing KPI targets so pending lines can be judged."
  }
  if (row.moneyAtRisk > 0) {
    return "Review the money-at-risk lines and decide whether to reallocate or extend."
  }
  if (row.pace === "ahead") {
    return "Hold the current daily rate and watch the next burst start."
  }
  return "Keep the current flights — no intervention needed today."
}
