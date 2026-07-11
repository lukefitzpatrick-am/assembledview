import "server-only";

import {
  resolveLiveAdServingPacingCampaignRows,
  type GetLiveAdServingLineItemsArgs,
} from "@/lib/pacing/ad-serving/resolveLiveAdServingLineItems";
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import type { PacingFactRow } from "@/lib/snowflake/pacing-fact";
import { queryPacingFact } from "@/lib/snowflake/pacing-fact";

export type FetchAdServingPacingCampaignRowsArgs = GetLiveAdServingLineItemsArgs;

function num(value: number | null | undefined): number {
  return value ?? 0;
}

function safeCtr(clicks: number, impressions: number): number | null {
  if (!Number.isFinite(impressions) || impressions <= 0) return null;
  if (!Number.isFinite(clicks)) return null;
  return clicks / impressions;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Ad Serving verification composer.
 *
 * Zero-spend law:
 * - Never calls computePacing / computeStatus
 * - Never surfaces spend, budget remaining, or $ variance
 * - Status is delivery-based only ("serving" | "no-data")
 * - Progress is impressions/clicks vs plan deliverable goals when present
 *
 * Campaigns with no matched PACING_FACT ad-serving rows are omitted.
 */
export async function fetchAdServingPacingCampaignRows(
  args: FetchAdServingPacingCampaignRowsArgs
): Promise<AdServingPacingCampaignRow[]> {
  const planRows = await resolveLiveAdServingPacingCampaignRows(args);
  if (planRows.length === 0) return [];

  const lineItemIds = Array.from(
    new Set(planRows.map((r) => r.lineItemId.toLowerCase()).filter(Boolean))
  );

  const lineTotalStart =
    planRows
      .map((r) => r.lineItemStartDate)
      .filter((d): d is string => !!d)
      .sort()[0] ?? args.asOfDate;

  let facts: PacingFactRow[] = [];
  try {
    facts = await queryPacingFact({
      channel: "ad-serving",
      lineItemIds,
      startDate: lineTotalStart,
      endDate: args.asOfDate,
    });
  } catch (err) {
    console.error("[fetchAdServingPacingCampaignRows] Snowflake query failed", {
      lineItemCount: lineItemIds.length,
      startDate: lineTotalStart,
      endDate: args.asOfDate,
      err,
    });
    return [];
  }

  const byLineItem = new Map<string, PacingFactRow[]>();
  for (const fact of facts) {
    const k = String(fact.LINE_ITEM_ID ?? "")
      .trim()
      .toLowerCase();
    if (!k) continue;
    let bucket = byLineItem.get(k);
    if (!bucket) {
      bucket = [];
      byLineItem.set(k, bucket);
    }
    bucket.push(fact);
  }

  const out: AdServingPacingCampaignRow[] = [];

  for (const row of planRows) {
    const matched = byLineItem.get(row.lineItemId.toLowerCase()) ?? [];
    // No CM360 verification rows → omit (same as dashboard adapter).
    if (matched.length === 0) continue;

    const windowStart = row.lineItemStartDate ?? lineTotalStart;
    const windowEnd = args.asOfDate;

    let impressions = 0;
    let clicks = 0;
    let results = 0;
    let videoCompletes = 0;
    const activeDays = new Set<string>();

    for (const fact of matched) {
      const d = fact.DATE_DAY;
      if (d < windowStart || d > windowEnd) continue;
      impressions += num(fact.IMPRESSIONS);
      clicks += num(fact.CLICKS);
      results += num(fact.RESULTS);
      videoCompletes += num(fact.VIDEO_3S_VIEWS);
      if (
        num(fact.IMPRESSIONS) > 0 ||
        num(fact.CLICKS) > 0 ||
        num(fact.RESULTS) > 0 ||
        num(fact.VIDEO_3S_VIEWS) > 0
      ) {
        activeDays.add(d);
      }
    }

    row.impressions = impressions;
    row.clicks = clicks;
    row.results = results;
    row.videoCompletes = videoCompletes;
    row.ctr = safeCtr(clicks, impressions);
    row.daysActive = activeDays.size;
    row.lineItemStatus = "serving";

    if (row.deliverableKind === "impressions" && row.deliverableTarget > 0) {
      row.deliverableActual = impressions;
      row.deliverableProgress = clamp01(impressions / row.deliverableTarget);
    } else if (row.deliverableKind === "clicks" && row.deliverableTarget > 0) {
      row.deliverableActual = clicks;
      row.deliverableProgress = clamp01(clicks / row.deliverableTarget);
    } else {
      row.deliverableActual = 0;
      row.deliverableProgress = null;
    }

    out.push(row);
  }

  return out;
}
