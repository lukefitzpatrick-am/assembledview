/**
 * Pure half of the Ad Serving pacing composer (`fetchAdServingPacingCampaignRows`).
 *
 * Counts are CM360 verification rows (PACING_FACT `ad-serving`). B32: a
 * Channel Factory Digital Video line (`isDirectDigitalPartnerFileLine`, the
 * dashboard's test) also takes its own partner-file rows (`programmatic-video`)
 * and is marked `deliverySource`. A line with both sources counts their sum,
 * as the dashboard section and `loadDeliverySnapshot` do (C-182).
 *
 * Zero-spend law: no `computePacing` / `computeStatus`, no spend, budget or $
 * variance here. Status is `serving | no-data`. Spend is estimated later by
 * `estimateDirectDigitalSpend` (portfolio assembler).
 */

import { isDirectDigitalPartnerFileLine } from "@/lib/delivery/directDigitalPartnerFile";
import { channelKeyForAdServingFamily } from "@/lib/delivery/directDigitalFeeLookup";
import type {
  AdServingChannelFamily,
  AdServingDeliverySource,
  AdServingPacingCampaignRow,
} from "@/lib/pacing/ad-serving/types";
import type { PacingFactRow } from "@/lib/snowflake/pacing-fact";

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

function lowerId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function factActive(fact: PacingFactRow): boolean {
  return (
    num(fact.IMPRESSIONS) > 0 ||
    num(fact.CLICKS) > 0 ||
    num(fact.RESULTS) > 0 ||
    num(fact.VIDEO_3S_VIEWS) > 0
  );
}

function bucketByLine(facts: readonly PacingFactRow[]): Map<string, PacingFactRow[]> {
  const byLineItem = new Map<string, PacingFactRow[]>();
  for (const fact of facts) {
    const k = lowerId(fact.LINE_ITEM_ID);
    if (!k) continue;
    let bucket = byLineItem.get(k);
    if (!bucket) {
      bucket = [];
      byLineItem.set(k, bucket);
    }
    bucket.push(fact);
  }
  return byLineItem;
}

/**
 * B32: the trimmed publisher for a Channel Factory Digital Video plan line,
 * else undefined (the row then omits `publisher` and is unchanged).
 */
export function adServingPartnerPublisher(
  channelFamily: AdServingChannelFamily,
  publisher: unknown,
  platform: unknown
): string | undefined {
  const key = channelKeyForAdServingFamily(channelFamily) ?? "";
  if (!isDirectDigitalPartnerFileLine(key, publisher, platform)) return undefined;
  return String(publisher ?? "").trim();
}

/** True when this row reads its partner-file rows (resolver set `publisher`, and the line test passes). */
export function isAdServingPartnerFileRow(row: AdServingPacingCampaignRow): boolean {
  if (row.publisher === undefined) return false;
  const key = channelKeyForAdServingFamily(row.channelFamily) ?? "";
  return isDirectDigitalPartnerFileLine(key, row.publisher, row.platform);
}

/** Lowercased ids of the rows that read partner-file rows. Empty for any book without Channel Factory DV lines. */
export function adServingPartnerFileLineIds(
  planRows: readonly AdServingPacingCampaignRow[]
): string[] {
  const ids = new Set<string>();
  for (const row of planRows) {
    if (!isAdServingPartnerFileRow(row)) continue;
    const id = lowerId(row.lineItemId);
    if (id) ids.add(id);
  }
  return [...ids];
}

function deliverySourceFor(
  cm360: readonly PacingFactRow[],
  partner: readonly PacingFactRow[],
  inWindow: (fact: PacingFactRow) => boolean
): AdServingDeliverySource | undefined {
  if (partner.length === 0) return undefined;
  const partnerActive = partner.some((fact) => inWindow(fact) && factActive(fact));
  const cm360Active = cm360.some((fact) => inWindow(fact) && factActive(fact));
  // Partner rows with no delivery beside delivering CM360 rows: CM360 counts only.
  if (!partnerActive && cm360.length > 0) return undefined;
  return cm360Active ? "partner_file_and_cm360" : "partner_file";
}

/**
 * Fill each plan row's counts from its facts. Rows with no matched fact are
 * omitted. `partnerFacts` are read only for `isAdServingPartnerFileRow` rows;
 * a partner fact on any other line is ignored.
 */
export function composeAdServingPacingRows(args: {
  planRows: AdServingPacingCampaignRow[];
  facts: readonly PacingFactRow[];
  partnerFacts?: readonly PacingFactRow[];
  lineTotalStart: string;
  countTo: string;
}): AdServingPacingCampaignRow[] {
  const byLineItem = bucketByLine(args.facts);
  const partnerByLineItem = bucketByLine(args.partnerFacts ?? []);
  const out: AdServingPacingCampaignRow[] = [];

  for (const row of args.planRows) {
    const id = row.lineItemId.toLowerCase();
    const cm360 = byLineItem.get(id) ?? [];
    const partner = isAdServingPartnerFileRow(row) ? (partnerByLineItem.get(id) ?? []) : [];
    const matched = partner.length > 0 ? [...cm360, ...partner] : cm360;
    // No CM360 (or B32 partner-file) rows → omit (same as dashboard adapter).
    if (matched.length === 0) continue;

    const windowStart = row.lineItemStartDate ?? args.lineTotalStart;
    const windowEnd = args.countTo;
    const inWindow = (fact: PacingFactRow) =>
      !(fact.DATE_DAY < windowStart || fact.DATE_DAY > windowEnd);

    let impressions = 0;
    let clicks = 0;
    let results = 0;
    let videoCompletes = 0;
    const activeDays = new Set<string>();

    for (const fact of matched) {
      const d = fact.DATE_DAY;
      if (!inWindow(fact)) continue;
      impressions += num(fact.IMPRESSIONS);
      clicks += num(fact.CLICKS);
      results += num(fact.RESULTS);
      videoCompletes += num(fact.VIDEO_3S_VIEWS);
      if (factActive(fact)) {
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

    const deliverySource = deliverySourceFor(cm360, partner, inWindow);
    if (deliverySource) row.deliverySource = deliverySource;

    out.push(row);
  }

  return out;
}
