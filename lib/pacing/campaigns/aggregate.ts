import {
  SearchPacingKpis,
  AdGroupBreakdown,
  PlatformCampaignBreakdown,
} from "@/lib/pacing/campaigns/types";
import type { SearchCampaignsPacingRawRow } from "@/lib/snowflake/search-campaigns-pacing";

/**
 * KPI ratios computed from sums, not averaged. Returns nulls when
 * denominators are zero to surface "no signal" rather than NaN/Infinity.
 */
function computeRatios(
  spend: number,
  clicks: number,
  impressions: number,
): { cpc: number | null; ctr: number | null; cpm: number | null } {
  return {
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

/** Empty KPI bundle — used when no Snowflake rows match a Xano line item. */
export function emptyKpis(): SearchPacingKpis {
  return {
    spendToDateLineTotal: 0,
    spendToDateCurrentBurst: 0,
    spendYesterday: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    cpc: null,
    ctr: null,
    cpm: null,
  };
}

export type DateWindows = {
  lineTotalStart: string;
  lineTotalEnd: string;
  currentBurstStart: string | null;
  currentBurstEnd: string | null;
  yesterday: string;
};

/**
 * Aggregates raw Snowflake ad-group-day rows into the three-level hierarchy
 * (line item → platform campaign → ad group) for a given Xano line item.
 */
export function aggregateForLineItem(
  rows: SearchCampaignsPacingRawRow[],
  windows: DateWindows,
): { lineItemKpis: SearchPacingKpis; platformCampaigns: PlatformCampaignBreakdown[] } {
  if (rows.length === 0) {
    return { lineItemKpis: emptyKpis(), platformCampaigns: [] };
  }

  const byCampaign = new Map<string, Map<string, SearchCampaignsPacingRawRow[]>>();
  for (const row of rows) {
    let campaign = byCampaign.get(row.CAMPAIGN_ID);
    if (!campaign) {
      campaign = new Map();
      byCampaign.set(row.CAMPAIGN_ID, campaign);
    }
    let adGroup = campaign.get(row.PLATFORM_LINE_ITEM_ID);
    if (!adGroup) {
      adGroup = [];
      campaign.set(row.PLATFORM_LINE_ITEM_ID, adGroup);
    }
    adGroup.push(row);
  }

  const platformCampaigns: PlatformCampaignBreakdown[] = [];

  for (const [campaignId, adGroupMap] of byCampaign.entries()) {
    const adGroups: AdGroupBreakdown[] = [];
    let campaignName = "";

    for (const [platformLineItemId, agRows] of adGroupMap.entries()) {
      const kpis = aggregateRows(agRows, windows);
      const first = agRows[0]!;
      adGroups.push({
        ...kpis,
        platformLineItemId,
        lineItemName: first.LINE_ITEM_NAME,
      });
      campaignName = first.CAMPAIGN_NAME;
    }

    adGroups.sort((a, b) => b.spendToDateLineTotal - a.spendToDateLineTotal);

    const campaignKpis = sumKpis(adGroups);
    platformCampaigns.push({
      ...campaignKpis,
      campaignId,
      campaignName,
      adGroups,
    });
  }

  platformCampaigns.sort((a, b) => b.spendToDateLineTotal - a.spendToDateLineTotal);

  const lineItemKpis = sumKpis(platformCampaigns);

  return { lineItemKpis, platformCampaigns };
}

function aggregateRows(rows: SearchCampaignsPacingRawRow[], windows: DateWindows): SearchPacingKpis {
  let spendLineTotal = 0;
  let spendCurrentBurst = 0;
  let spendYesterday = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let revenue = 0;

  for (const row of rows) {
    const d = row.DATE_DAY;
    if (d >= windows.lineTotalStart && d <= windows.lineTotalEnd) {
      spendLineTotal += row.AMOUNT_SPENT;
      impressions += row.IMPRESSIONS;
      clicks += row.CLICKS;
      conversions += row.CONVERSIONS;
      revenue += row.REVENUE;
    }
    if (
      windows.currentBurstStart &&
      windows.currentBurstEnd &&
      d >= windows.currentBurstStart &&
      d <= windows.currentBurstEnd
    ) {
      spendCurrentBurst += row.AMOUNT_SPENT;
    }
    if (d === windows.yesterday) {
      spendYesterday += row.AMOUNT_SPENT;
    }
  }

  return {
    spendToDateLineTotal: spendLineTotal,
    spendToDateCurrentBurst: spendCurrentBurst,
    spendYesterday,
    impressions,
    clicks,
    conversions,
    revenue,
    ...computeRatios(spendLineTotal, clicks, impressions),
  };
}

function sumKpis(children: SearchPacingKpis[]): SearchPacingKpis {
  let spendLineTotal = 0;
  let spendCurrentBurst = 0;
  let spendYesterday = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let revenue = 0;

  for (const c of children) {
    spendLineTotal += c.spendToDateLineTotal;
    spendCurrentBurst += c.spendToDateCurrentBurst;
    spendYesterday += c.spendYesterday;
    impressions += c.impressions;
    clicks += c.clicks;
    conversions += c.conversions;
    revenue += c.revenue;
  }

  return {
    spendToDateLineTotal: spendLineTotal,
    spendToDateCurrentBurst: spendCurrentBurst,
    spendYesterday,
    impressions,
    clicks,
    conversions,
    revenue,
    ...computeRatios(spendLineTotal, clicks, impressions),
  };
}
