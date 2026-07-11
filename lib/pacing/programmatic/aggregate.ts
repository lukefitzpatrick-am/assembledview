import type { DeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import type { DateWindows } from "@/lib/pacing/campaigns/aggregate";
import type {
  ProgrammaticEntityBreakdown,
  ProgrammaticPacingMetrics,
  ProgrammaticPlatformCampaignBreakdown,
  ProgrammaticSnowflakeChannel,
} from "@/lib/pacing/programmatic/types";
import type { PacingFactRow } from "@/lib/snowflake/pacing-fact";

export type ProgrammaticFactRow = PacingFactRow & {
  snowflakeChannel: ProgrammaticSnowflakeChannel;
};

function num(value: number | null | undefined): number {
  return value ?? 0;
}

function computeProgrammaticRatios(
  spend: number,
  impressions: number,
  clicks: number,
  results: number,
  videoViews: number
): Pick<ProgrammaticPacingMetrics, "ctr" | "conversionRate" | "cpm" | "cpv" | "vtr"> {
  return {
    ctr: impressions > 0 ? clicks / impressions : null,
    conversionRate: impressions > 0 ? results / impressions : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    cpv: videoViews > 0 ? spend / videoViews : null,
    vtr: impressions > 0 ? videoViews / impressions : null,
  };
}

function emptyMetrics(): ProgrammaticPacingMetrics {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    videoViews: 0,
    ctr: null,
    conversionRate: null,
    cpm: null,
    cpv: null,
    vtr: null,
  };
}

function pickDeliverableActual(
  metrics: ProgrammaticPacingMetrics,
  deliverableMetric: DeliverableMetric
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

function aggregateRows(
  rows: ProgrammaticFactRow[],
  windows: DateWindows
): ProgrammaticPacingMetrics {
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
    ...computeProgrammaticRatios(spend, impressions, clicks, results, videoViews),
  };
}

function sumMetrics(children: ProgrammaticPacingMetrics[]): ProgrammaticPacingMetrics {
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
    ...computeProgrammaticRatios(spend, impressions, clicks, results, videoViews),
  };
}

/**
 * Aggregates PACING_FACT rows into line-item → campaign → entity hierarchy.
 */
export function aggregateProgrammaticForLineItem(
  rows: ProgrammaticFactRow[],
  windows: DateWindows,
  deliverableMetric: DeliverableMetric
): {
  metrics: ProgrammaticPacingMetrics;
  deliverableActual: number;
  campaigns: ProgrammaticPlatformCampaignBreakdown[];
} {
  if (rows.length === 0) {
    const metrics = emptyMetrics();
    return { metrics, deliverableActual: 0, campaigns: [] };
  }

  const byCampaign = new Map<string, Map<string, ProgrammaticFactRow[]>>();
  for (const row of rows) {
    const campaignKey = row.CAMPAIGN_NAME ?? "";
    let campaign = byCampaign.get(campaignKey);
    if (!campaign) {
      campaign = new Map();
      byCampaign.set(campaignKey, campaign);
    }
    const entityId = row.ENTITY_ID ?? "";
    let entities = campaign.get(entityId);
    if (!entities) {
      entities = [];
      campaign.set(entityId, entities);
    }
    entities.push(row);
  }

  const campaigns: ProgrammaticPlatformCampaignBreakdown[] = [];

  for (const [campaignName, entityMap] of byCampaign.entries()) {
    const entities: ProgrammaticEntityBreakdown[] = [];

    for (const [entityId, entityRows] of entityMap.entries()) {
      const metrics = aggregateRows(entityRows, windows);
      const first = entityRows[0]!;
      entities.push({
        ...metrics,
        entityId,
        entityName: first.ENTITY_NAME ?? "",
      });
    }

    entities.sort((a, b) => b.spend - a.spend);

    const campaignMetrics = sumMetrics(entities);
    campaigns.push({
      ...campaignMetrics,
      campaignId: campaignName,
      campaignName,
      entities,
    });
  }

  campaigns.sort((a, b) => b.spend - a.spend);

  const metrics = sumMetrics(campaigns);
  const deliverableActual = pickDeliverableActual(metrics, deliverableMetric);

  return { metrics, deliverableActual, campaigns };
}
