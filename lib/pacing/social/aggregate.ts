import type { DeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import type { DateWindows } from "@/lib/pacing/campaigns/aggregate";
import type {
  SocialAdSetBreakdown,
  SocialPacingMetrics,
  SocialPlatform,
  SocialPlatformCampaignBreakdown,
} from "@/lib/pacing/social/types";
import type { PacingFactRow } from "@/lib/snowflake/pacing-fact";

export type SocialFactRow = PacingFactRow & { socialPlatform: SocialPlatform };

function num(value: number | null | undefined): number {
  return value ?? 0;
}

/**
 * KPI ratios computed from sums, not averaged. Returns nulls when denominators
 * are zero to surface "no signal" rather than NaN/Infinity (mirrors computeRatios
 * in lib/pacing/campaigns/aggregate.ts).
 */
function computeSocialRatios(
  spend: number,
  impressions: number,
  clicks: number,
  results: number,
  videoViews: number,
): Pick<SocialPacingMetrics, "ctr" | "conversionRate" | "cpv" | "vtr"> {
  return {
    ctr: impressions > 0 ? clicks / impressions : null,
    conversionRate: impressions > 0 ? results / impressions : null,
    cpv: videoViews > 0 ? spend / videoViews : null,
    vtr: impressions > 0 ? videoViews / impressions : null,
  };
}

/** Empty metrics bundle — used when no fact rows match a Xano line item. */
function emptySocialMetrics(): SocialPacingMetrics {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    videoViews: 0,
    ctr: null,
    conversionRate: null,
    cpv: null,
    vtr: null,
  };
}

function pickDeliverableActual(
  metrics: SocialPacingMetrics,
  deliverableMetric: DeliverableMetric,
): number {
  switch (deliverableMetric) {
    case "IMPRESSIONS":
      return metrics.impressions;
    case "CLICKS":
      return metrics.clicks;
    case "RESULTS":
      return metrics.results;
    case "VIDEO_3S_VIEWS":
      return metrics.videoViews;
  }
}

function aggregateRows(rows: SocialFactRow[], windows: DateWindows): SocialPacingMetrics {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let results = 0;
  let videoViews = 0;

  for (const row of rows) {
    const d = row.DATE_DAY;
    if (d >= windows.lineTotalStart && d <= windows.lineTotalEnd) {
      spend += num(row.AMOUNT_SPENT);
      impressions += num(row.IMPRESSIONS);
      clicks += num(row.CLICKS);
      results += num(row.RESULTS);
      videoViews += num(row.VIDEO_3S_VIEWS);
    }
  }

  return {
    spend,
    impressions,
    clicks,
    results,
    videoViews,
    ...computeSocialRatios(spend, impressions, clicks, results, videoViews),
  };
}

function sumMetrics(children: SocialPacingMetrics[]): SocialPacingMetrics {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let results = 0;
  let videoViews = 0;

  for (const c of children) {
    spend += c.spend;
    impressions += c.impressions;
    clicks += c.clicks;
    results += c.results;
    videoViews += c.videoViews;
  }

  return {
    spend,
    impressions,
    clicks,
    results,
    videoViews,
    ...computeSocialRatios(spend, impressions, clicks, results, videoViews),
  };
}

/**
 * Aggregates ad-set-day fact rows into the three-level hierarchy
 * (line item → platform campaign → ad set) for a given Xano line item.
 * Rows are expected to be pre-filtered to a single line item.
 */
export function aggregateSocialForLineItem(
  rows: SocialFactRow[],
  windows: DateWindows,
  deliverableMetric: DeliverableMetric,
): {
  metrics: SocialPacingMetrics;
  deliverableActual: number;
  campaigns: SocialPlatformCampaignBreakdown[];
} {
  if (rows.length === 0) {
    const metrics = emptySocialMetrics();
    return { metrics, deliverableActual: 0, campaigns: [] };
  }

  // No CAMPAIGN_ID on social facts — group by CAMPAIGN_NAME as the campaign key.
  const byCampaign = new Map<string, Map<string, SocialFactRow[]>>();
  for (const row of rows) {
    const campaignKey = row.CAMPAIGN_NAME ?? "";
    let campaign = byCampaign.get(campaignKey);
    if (!campaign) {
      campaign = new Map();
      byCampaign.set(campaignKey, campaign);
    }
    const entityId = row.ENTITY_ID ?? "";
    let adSet = campaign.get(entityId);
    if (!adSet) {
      adSet = [];
      campaign.set(entityId, adSet);
    }
    adSet.push(row);
  }

  const campaigns: SocialPlatformCampaignBreakdown[] = [];

  for (const [campaignName, adSetMap] of byCampaign.entries()) {
    const adSets: SocialAdSetBreakdown[] = [];

    for (const [entityId, adSetRows] of adSetMap.entries()) {
      const metrics = aggregateRows(adSetRows, windows);
      const first = adSetRows[0]!;
      adSets.push({
        ...metrics,
        entityId,
        entityName: first.ENTITY_NAME ?? "",
      });
    }

    adSets.sort((a, b) => b.spend - a.spend);

    const campaignMetrics = sumMetrics(adSets);
    campaigns.push({
      ...campaignMetrics,
      campaignId: campaignName,
      campaignName,
      adSets,
    });
  }

  campaigns.sort((a, b) => b.spend - a.spend);

  const metrics = sumMetrics(campaigns);
  const deliverableActual = pickDeliverableActual(metrics, deliverableMetric);

  return { metrics, deliverableActual, campaigns };
}
