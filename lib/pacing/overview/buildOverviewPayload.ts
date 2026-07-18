import "server-only";

import { getAsOfDate } from "@/lib/pacing/maths";
import {
  getCachedAdServingPacingRows,
  getCachedDirectPacingRows,
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache";
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus";
import {
  mapAdServingRowToOverviewItem,
  mapDirectLineToOverviewItem,
  mapSpendRowToOverviewItem,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems";
import {
  resolveOverviewClientScope,
  type OverviewClientScope,
} from "@/lib/pacing/overview/resolveOverviewClientScope";
import type {
  OverviewAttentionItem,
  OverviewChannel,
  OverviewPayload,
} from "@/lib/pacing/overview/types";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";

/** Leave headroom under route maxDuration so partial results can still serialize. */
export const OVERVIEW_SOURCE_TIMEOUT_MS = 45_000;

const ALL_CHANNELS: OverviewChannel[] = [
  "search",
  "social",
  "programmatic",
  "ad-serving",
  "direct",
];

type ChannelFetchers = {
  search: typeof getCachedSearchPacingRows;
  social: typeof getCachedSocialPacingRows;
  programmatic: typeof getCachedProgrammaticPacingRows;
  direct: typeof getCachedDirectPacingRows;
  adServing: typeof getCachedAdServingPacingRows;
};

const defaultFetchers: ChannelFetchers = {
  search: getCachedSearchPacingRows,
  social: getCachedSocialPacingRows,
  programmatic: getCachedProgrammaticPacingRows,
  direct: getCachedDirectPacingRows,
  adServing: getCachedAdServingPacingRows,
};

export function withSourceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: OverviewChannel
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`[pacing/overview] ${label} timed out after ${ms}ms`)
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export type BuildOverviewPayloadArgs = {
  asOfDate?: string;
  /** Auth access set; null = admin (still paginated — never fan-out with null/"all"). */
  allowedClientSlugs: Set<string> | null;
  clientSlug?: string | null;
  page?: number;
  pageSize?: number;
  /** Per-source timeout; defaults to OVERVIEW_SOURCE_TIMEOUT_MS. */
  sourceTimeoutMs?: number;
};

/**
 * Portfolio Overview: UNION of the same 4h cached channel fetchers the
 * channel tabs use. Fan-out uses the full live-in-window (access-filtered)
 * client set so KPI tiles cover the portfolio; attention lists are filtered
 * to the current page. Tolerant of individual source failures
 * (allSettled + timeout → partial 200).
 */
export async function buildOverviewPayload(
  args: BuildOverviewPayloadArgs,
  deps?: {
    resolveScope?: (
      a: BuildOverviewPayloadArgs & { asOfDate: string }
    ) => Promise<OverviewClientScope>;
    fetchers?: Partial<ChannelFetchers>;
  }
): Promise<OverviewPayload> {
  const asOfDate = args.asOfDate?.trim() || getAsOfDate();
  const sourceTimeoutMs = args.sourceTimeoutMs ?? OVERVIEW_SOURCE_TIMEOUT_MS;
  const fetchers: ChannelFetchers = { ...defaultFetchers, ...deps?.fetchers };

  const scope = await (deps?.resolveScope ??
    ((a) =>
      resolveOverviewClientScope({
        asOfDate: a.asOfDate,
        accessAllowedClientSlugs: a.allowedClientSlugs,
        clientSlug: a.clientSlug,
        page: a.page,
        pageSize: a.pageSize,
      })))({ ...args, asOfDate });

  // Full portfolio Set — never null/"all" — so cache keys stay scoped and
  // KPI counts cover every live-in-window client the user can see.
  const scopedSlugs = scope.clientSlugs;
  const pageSlugSet = new Set(scope.pageSlugs);

  const settled = await Promise.allSettled([
    withSourceTimeout(
      fetchers.search(asOfDate, scopedSlugs),
      sourceTimeoutMs,
      "search"
    ),
    withSourceTimeout(
      fetchers.social(asOfDate, scopedSlugs),
      sourceTimeoutMs,
      "social"
    ),
    withSourceTimeout(
      fetchers.programmatic(asOfDate, scopedSlugs),
      sourceTimeoutMs,
      "programmatic"
    ),
    withSourceTimeout(
      fetchers.direct(asOfDate, scopedSlugs, false),
      sourceTimeoutMs,
      "direct"
    ),
    withSourceTimeout(
      fetchers.adServing(asOfDate, scopedSlugs),
      sourceTimeoutMs,
      "ad-serving"
    ),
  ]);

  const channelOrder: OverviewChannel[] = [
    "search",
    "social",
    "programmatic",
    "direct",
    "ad-serving",
  ];

  const availableSources: OverviewChannel[] = [];
  const unavailableSources: OverviewChannel[] = [];
  const items: OverviewAttentionItem[] = [];
  let kpiPending = 0;

  for (let i = 0; i < settled.length; i++) {
    const channel = channelOrder[i]!;
    const result = settled[i]!;
    if (result.status === "rejected") {
      unavailableSources.push(channel);
      console.warn(
        "[pacing/overview] source unavailable",
        channel,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
      continue;
    }
    availableSources.push(channel);
    const value = result.value;

    if (channel === "search") {
      const search = value as Awaited<ReturnType<typeof getCachedSearchPacingRows>>;
      for (const row of search ?? []) {
        items.push(
          mapSpendRowToOverviewItem(
            "search",
            {
              clientName: row.clientName,
              campaignName: row.campaignName,
              mbaNumber: row.mbaNumber,
              lineItemId: row.lineItemId,
              currentBurst: row.currentBurst,
              spendToDateCurrentBurst: row.spendToDateCurrentBurst,
              spendYesterday: row.spendYesterday,
              impressions: row.impressions,
              clicks: row.clicks,
              conversions: row.conversions,
              revenue: row.revenue,
            },
            asOfDate
          )
        );
        if (computeRowKpiStatus(row) === "kpi-pending") kpiPending += 1;
      }
    } else if (channel === "social") {
      const social = value as Awaited<ReturnType<typeof getCachedSocialPacingRows>>;
      for (const row of social ?? []) {
        items.push(
          mapSpendRowToOverviewItem(
            "social",
            {
              clientName: row.clientName,
              campaignName: row.campaignName,
              mbaNumber: row.mbaNumber,
              lineItemId: row.lineItemId,
              currentBurst: row.currentBurst,
              spendToDateCurrentBurst: row.spendToDateCurrentBurst,
              spendYesterday: row.spendYesterday,
              impressions: row.impressions,
              clicks: row.clicks,
              conversions: 0,
              revenue: 0,
            },
            asOfDate
          )
        );
      }
    } else if (channel === "programmatic") {
      const programmatic = value as Awaited<
        ReturnType<typeof getCachedProgrammaticPacingRows>
      >;
      for (const row of programmatic ?? []) {
        items.push(
          mapSpendRowToOverviewItem(
            "programmatic",
            {
              clientName: row.clientName,
              campaignName: row.campaignName,
              mbaNumber: row.mbaNumber,
              lineItemId: row.lineItemId,
              currentBurst: row.currentBurst,
              spendToDateCurrentBurst: row.spendToDateCurrentBurst,
              spendYesterday: row.spendYesterday,
              impressions: row.impressions,
              clicks: row.clicks,
              conversions: 0,
              revenue: 0,
            },
            asOfDate
          )
        );
      }
    } else if (channel === "direct") {
      const direct = value as Awaited<ReturnType<typeof getCachedDirectPacingRows>>;
      for (const group of direct ?? []) {
        for (const line of group.lineItems) {
          items.push(
            mapDirectLineToOverviewItem({
              clientName: group.clientName,
              campaignName: group.campaignName,
              mbaNumber: group.mbaNumber,
              lineItemId: line.lineItemId,
              lineItemName: line.lineItemName,
              lineItemStatus: line.lineItemStatus,
              burstStatuses: line.bursts.map((b) => b.status),
              bookedCost: line.totalBudget,
              spentCost: line.totalActual,
            })
          );
        }
      }
    } else {
      const adServing = value as Awaited<
        ReturnType<typeof getCachedAdServingPacingRows>
      >;
      for (const row of adServing ?? []) {
        items.push(
          mapAdServingRowToOverviewItem({
            clientName: row.clientName,
            campaignName: row.campaignName,
            mbaNumber: row.mbaNumber,
            lineItemId: row.lineItemId,
            lineItemLabel: row.creative || row.lineItemId,
            lineItemStatus: row.lineItemStatus,
          })
        );
      }
    }
  }

  // Preserve canonical channel order in available/unavailable lists
  const orderIndex = new Map(ALL_CHANNELS.map((c, idx) => [c, idx]));
  availableSources.sort(
    (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)
  );
  unavailableSources.sort(
    (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)
  );

  const summarized = summarizeOverviewItems(items, kpiPending);

  const onPage = (item: OverviewAttentionItem) =>
    pageSlugSet.has(slugifyPlanClientName(item.clientName));

  return {
    counts: summarized.counts,
    underperforming: summarized.underperforming.filter(onPage),
    overPacing: summarized.overPacing.filter(onPage),
    aheadOnDelivery: summarized.aheadOnDelivery.filter(onPage),
    asOfDate,
    availableSources,
    unavailableSources,
    scope: {
      page: scope.page,
      pageSize: scope.pageSize,
      totalClients: scope.totalClients,
      clientSlugs: scope.pageSlugs,
      hasMore: scope.hasMore,
    },
  };
}
