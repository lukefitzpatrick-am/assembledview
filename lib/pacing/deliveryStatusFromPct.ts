/**
 * Campaign-delivery band from a pacing percent.
 * Reads `PACING_STATUS_THRESHOLDS`. Callers that paint `DeliveryStatus`
 * have no Over-pacing colour, so ≥115 stays Ahead here.
 * The full band, including Over-pacing, is `statusFromExpectedPct`.
 *
 * Cannot render Over-pacing:
 * - `components/dashboard/delivery/shared/statusColours.ts` (progress cards,
 *   status pills, KPI tiles, search / social / programmatic / direct-digital adapters)
 * - `lib/reports/campaignReport/buildCampaignReportDeck.ts` pace colour
 *   (Ahead is coral; every other band is ink)
 * `CampaignStatusStrip` has an Over-pacing pill, but it calls this helper,
 * so ≥115 still reads Ahead of plan on the strip.
 */

import {
  PACING_STATUS_THRESHOLDS,
  statusFromExpectedPct,
} from "@/lib/pacing/status"

export type DeliveryStatus = "on-track" | "ahead" | "behind" | "no-data"

export const BEHIND_BELOW_PCT = PACING_STATUS_THRESHOLDS.behindBelowPct
export const AHEAD_ABOVE_PCT = PACING_STATUS_THRESHOLDS.aheadAbovePct

export function deliveryStatusFromPct(pct: number | undefined): DeliveryStatus {
  const band = statusFromExpectedPct(pct)
  if (band === "over-pacing") return "ahead"
  return band
}
