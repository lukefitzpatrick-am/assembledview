/**
 * Campaign-delivery Ahead / Behind / On track from a pacing percent.
 * Distinct from the admin `PacingStatus` ladder in `lib/pacing/maths`.
 */

export type DeliveryStatus = "on-track" | "ahead" | "behind" | "no-data"

export const BEHIND_BELOW_PCT = 90
export const AHEAD_ABOVE_PCT = 110

export function deliveryStatusFromPct(pct: number | undefined): DeliveryStatus {
  if (pct === undefined || Number.isNaN(pct)) return "no-data"
  if (pct < BEHIND_BELOW_PCT) return "behind"
  if (pct > AHEAD_ABOVE_PCT) return "ahead"
  return "on-track"
}
