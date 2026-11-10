/**
 * B32: the one label every `/pacing` consumer shows for an ad-serving row
 * whose counts include Channel Factory partner-file rows (`deliverySource`).
 * Those counts are partner-reported, not CM360 verification. A row without
 * `deliverySource` has no label and renders exactly as before.
 * Pure: safe for client components.
 */

import type { AdServingDeliverySource } from "@/lib/pacing/ad-serving/types";

/** The only partner feed a Direct Booked line reads today (`isDirectDigitalPartnerFileLine`). */
export const PARTNER_FEED_NAME = "Channel Factory";

export const PARTNER_REPORTED = "Partner-reported";

/** "Partner-reported (Channel Factory)", plus " + CM360" when both sources delivered. Null without a source. */
export function adServingDeliverySourceLabel(
  source: AdServingDeliverySource | null | undefined
): string | null {
  if (source === "partner_file") return `${PARTNER_REPORTED} (${PARTNER_FEED_NAME})`;
  if (source === "partner_file_and_cm360") {
    return `${PARTNER_REPORTED} (${PARTNER_FEED_NAME}) + CM360`;
  }
  return null;
}

/** Short source name for a line card's platform and KPI chip. */
export function adServingDeliverySourceShort(
  source: AdServingDeliverySource | null | undefined
): string | null {
  if (source === "partner_file") return PARTNER_FEED_NAME;
  if (source === "partner_file_and_cm360") return `${PARTNER_FEED_NAME} + CM360`;
  return null;
}
