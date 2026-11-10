import "server-only";

import {
  resolveLiveAdServingPacingCampaignRows,
  type GetLiveAdServingLineItemsArgs,
} from "@/lib/pacing/ad-serving/resolveLiveAdServingLineItems";
import {
  adServingPartnerFileLineIds,
  composeAdServingPacingRows,
} from "@/lib/pacing/ad-serving/composeAdServingPacingRows";
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import type { PacingFactRow } from "@/lib/snowflake/pacing-fact";
import { queryPacingFact } from "@/lib/snowflake/pacing-fact";
import { PARTNER_FILE_VIDEO_CHANNEL } from "@/lib/delivery/directDigitalPartnerFile";
import { composerCountToISO } from "@/lib/pacing/countTo";

export type FetchAdServingPacingCampaignRowsArgs = GetLiveAdServingLineItemsArgs & {
  /**
   * Last day counted (P1, `lib/pacing/countTo.ts`). Facts stop here.
   * Liveness stays on `asOfDate`. Unset counts to `asOfDate`.
   */
  countToDate?: string;
};

/**
 * Ad Serving delivery-count composer.
 *
 * Zero-spend law:
 * - Never calls computePacing / computeStatus
 * - Never surfaces spend, budget remaining, or $ variance
 * - Status is delivery-based only ("serving" | "no-data")
 * - Progress is impressions/clicks vs plan deliverable goals when present
 *
 * Counts are CM360 verification rows. B32: a Channel Factory Digital Video
 * line also reads its own partner-file rows (one extra query, only when such
 * a line is live, run beside the CM360 query) and is marked `deliverySource`
 * (`composeAdServingPacingRows`). Either query failing fails the fetch.
 * Campaigns with no matched rows are omitted.
 */
export async function fetchAdServingPacingCampaignRows(
  args: FetchAdServingPacingCampaignRowsArgs
): Promise<AdServingPacingCampaignRow[]> {
  const planRows = await resolveLiveAdServingPacingCampaignRows(args);
  if (planRows.length === 0) return [];

  const lineItemIds = Array.from(
    new Set(planRows.map((r) => r.lineItemId.toLowerCase()).filter(Boolean))
  );
  const partnerLineItemIds = adServingPartnerFileLineIds(planRows);

  const countTo = composerCountToISO(args);
  const lineTotalStart =
    planRows
      .map((r) => r.lineItemStartDate)
      .filter((d): d is string => !!d)
      .sort()[0] ?? countTo;

  let facts: PacingFactRow[] = [];
  let partnerFacts: PacingFactRow[] = [];
  try {
    // B33: the partner query runs beside the CM360 query, not after it.
    // Either rejecting fails the fetch, as before.
    [facts, partnerFacts] = await Promise.all([
      queryPacingFact({
        channel: "ad-serving",
        lineItemIds,
        startDate: lineTotalStart,
        endDate: countTo,
      }),
      partnerLineItemIds.length > 0
        ? queryPacingFact({
            channel: PARTNER_FILE_VIDEO_CHANNEL,
            lineItemIds: partnerLineItemIds,
            startDate: lineTotalStart,
            endDate: countTo,
          })
        : Promise.resolve<PacingFactRow[]>([]),
    ]);
  } catch (err) {
    console.error("[fetchAdServingPacingCampaignRows] Snowflake query failed", {
      lineItemCount: lineItemIds.length,
      partnerLineItemCount: partnerLineItemIds.length,
      startDate: lineTotalStart,
      endDate: countTo,
      err,
    });
    // Dead warehouse ≠ “no campaigns” — propagate for ViewState / route 5xx.
    throw err;
  }

  return composeAdServingPacingRows({
    planRows,
    facts,
    partnerFacts,
    lineTotalStart,
    countTo,
  });
}
