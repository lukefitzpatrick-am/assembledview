import "server-only";

import { getLiveSearchLineItemIds } from "@/lib/pacing/campaigns/liveSearchLineItems";
import { querySnowflake } from "@/lib/snowflake/query";

export type OrphanAdGroup = {
  channel: string;
  platformLineItemId: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  currentLineItemId: string | null;
  spendLast30d: number;
  impressionsLast30d: number;
  firstSeenDate: string;
  lastSeenDate: string;
};

export const SEARCH_PACING_CHANNELS = [
  "Search - Google Ads",
  "Shopping - Google Ads",
  "PMax - Google Ads",
] as const;

export type SearchPacingChannel = (typeof SEARCH_PACING_CHANNELS)[number];

export type GetOrphanAdGroupsArgs = {
  asOfDate: string;
  dateWindowDays: number;
  channelFilter?: SearchPacingChannel | null;
  spendThreshold?: number;
};

/**
 * Returns orphan ad groups in SEARCH_PACING_FACT — rows where
 * LINE_ITEM_ID is NULL or doesn't match any live Xano line item.
 */
export async function getOrphanAdGroups(args: GetOrphanAdGroupsArgs): Promise<OrphanAdGroup[]> {
  const liveIds = await getLiveSearchLineItemIds({
    asOfDate: args.asOfDate,
    allowedClientSlugs: null,
  });

  const channels: string[] = args.channelFilter
    ? [args.channelFilter]
    : [...SEARCH_PACING_CHANNELS];

  const liveIdArray = Array.from(liveIds);
  const liveIdPlaceholders =
    liveIdArray.length > 0 ? liveIdArray.map(() => "?").join(",") : "NULL";

  const channelPlaceholders = channels.map(() => "?").join(",");

  const spendClause = (args.spendThreshold ?? 0) > 0 ? "HAVING SUM(AMOUNT_SPENT) >= ?" : "";

  const sql = `
    SELECT
      CHANNEL,
      CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) AS PLATFORM_LINE_ITEM_ID,
      CAST(CAMPAIGN_ID AS VARCHAR) AS CAMPAIGN_ID,
      MAX(CAMPAIGN_NAME) AS CAMPAIGN_NAME,
      MAX(LINE_ITEM_NAME) AS AD_GROUP_NAME,
      ANY_VALUE(LINE_ITEM_ID) AS CURRENT_LINE_ITEM_ID,
      SUM(AMOUNT_SPENT) AS SPEND_LAST_WINDOW,
      SUM(IMPRESSIONS) AS IMPRESSIONS_LAST_WINDOW,
      MIN(CAST(DATE_DAY AS DATE)) AS FIRST_SEEN_DATE,
      MAX(CAST(DATE_DAY AS DATE)) AS LAST_SEEN_DATE
    FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
    WHERE CAST(DATE_DAY AS DATE) >= DATEADD(day, -?, CURRENT_DATE())
      AND CHANNEL IN (${channelPlaceholders})
      AND (
        LINE_ITEM_ID IS NULL
        OR LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) NOT IN (${liveIdPlaceholders})
      )
    GROUP BY
      CHANNEL,
      CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR),
      CAST(CAMPAIGN_ID AS VARCHAR)
    ${spendClause}
    ORDER BY SPEND_LAST_WINDOW DESC NULLS LAST
  `;

  const binds: (string | number)[] = [args.dateWindowDays, ...channels];
  if (liveIdArray.length > 0) binds.push(...liveIdArray);
  if ((args.spendThreshold ?? 0) > 0) binds.push(args.spendThreshold!);

  const rows = await querySnowflake<{
    CHANNEL: string;
    PLATFORM_LINE_ITEM_ID: string;
    CAMPAIGN_ID: string;
    CAMPAIGN_NAME: string;
    AD_GROUP_NAME: string;
    CURRENT_LINE_ITEM_ID: string | null;
    SPEND_LAST_WINDOW: number;
    IMPRESSIONS_LAST_WINDOW: number;
    FIRST_SEEN_DATE: string;
    LAST_SEEN_DATE: string;
  }>(sql, binds, { label: "orphan_ad_groups" });

  return rows.map((r) => ({
    channel: r.CHANNEL,
    platformLineItemId: r.PLATFORM_LINE_ITEM_ID,
    campaignId: r.CAMPAIGN_ID,
    campaignName: r.CAMPAIGN_NAME,
    adGroupName: r.AD_GROUP_NAME,
    currentLineItemId: r.CURRENT_LINE_ITEM_ID,
    spendLast30d: Number(r.SPEND_LAST_WINDOW) || 0,
    impressionsLast30d: Number(r.IMPRESSIONS_LAST_WINDOW) || 0,
    firstSeenDate: String(r.FIRST_SEEN_DATE).slice(0, 10),
    lastSeenDate: String(r.LAST_SEEN_DATE).slice(0, 10),
  }));
}
