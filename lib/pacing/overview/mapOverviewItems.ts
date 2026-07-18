import { computePacing, type PacingStatus } from "@/lib/pacing/maths";
import type {
  OverviewAttentionItem,
  OverviewAttentionStatus,
  OverviewChannel,
  OverviewPayload,
  OverviewStatusCounts,
} from "@/lib/pacing/overview/types";

const CHANNEL_HREF: Record<OverviewChannel, string> = {
  search: "/pacing/search",
  social: "/pacing/social",
  programmatic: "/pacing/programmatic",
  "ad-serving": "/pacing/ad-serving",
  direct: "/pacing/direct",
};

/** Map raw maths status → Overview bands (does not change maths). */
export function overviewStatusFromPacing(status: PacingStatus): OverviewAttentionStatus {
  switch (status) {
    case "over_pacing":
      return "over-pacing";
    case "slightly_over":
      return "ahead";
    case "on_track":
    case "completed":
      return "on-track";
    case "slightly_under":
    case "under_pacing":
    case "no_delivery":
      return "behind";
    case "not_started":
    case "unknown":
      return "no-data";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export type SpendWindowInput = {
  clientName: string;
  campaignName: string;
  mbaNumber: string;
  lineItemId: string;
  /** Optional display name; defaults to lineItemId. */
  lineItemLabel?: string | null;
  currentBurst: { budget: number; startDate: string; endDate: string } | null;
  spendToDateCurrentBurst: number;
  spendYesterday: number;
  impressions: number;
  clicks: number;
  conversions?: number;
  revenue?: number;
};

/**
 * Re-run computePacing on cached row fields so Overview can split
 * slightly_over (ahead) from over_pacing without changing channel DTOs.
 */
export function mapSpendRowToOverviewItem(
  channel: "search" | "social" | "programmatic",
  row: SpendWindowInput,
  asOfDate: string
): OverviewAttentionItem {
  const label = row.lineItemLabel?.trim() || row.lineItemId;
  const id = `${channel}:${row.mbaNumber}:${row.lineItemId}`;

  if (row.currentBurst === null) {
    return {
      id,
      channel,
      clientName: row.clientName,
      campaignName: row.campaignName,
      mbaNumber: row.mbaNumber,
      lineItemLabel: label,
      status: "no-data",
      budget: null,
      spendToDate: null,
      href: CHANNEL_HREF[channel],
    };
  }

  const maths = computePacing({
    lineItemBudget: row.currentBurst.budget,
    startDate: row.currentBurst.startDate,
    endDate: row.currentBurst.endDate,
    spendToDate: row.spendToDateCurrentBurst,
    spendYesterday: row.spendYesterday,
    impressionsToDate: row.impressions,
    clicksToDate: row.clicks,
    conversionsToDate: row.conversions ?? 0,
    revenueToDate: row.revenue ?? 0,
    asOfDate,
  });

  return {
    id,
    channel,
    clientName: row.clientName,
    campaignName: row.campaignName,
    mbaNumber: row.mbaNumber,
    lineItemLabel: label,
    status: overviewStatusFromPacing(maths.status),
    budget: row.currentBurst.budget,
    spendToDate: row.spendToDateCurrentBurst,
    href: CHANNEL_HREF[channel],
  };
}

/** Direct line-item status → Overview band (same intent as digest banding). */
export function overviewStatusFromDirectLineStatus(
  status: string,
  burstStatuses: string[] = []
): OverviewAttentionStatus {
  if (status === "mixed") {
    if (burstStatuses.includes("completed_under")) return "behind";
    if (burstStatuses.includes("completed_over")) return "ahead";
    if (
      burstStatuses.includes("in_progress") ||
      burstStatuses.includes("completed")
    ) {
      return "on-track";
    }
    return "no-data";
  }
  switch (status) {
    case "completed_under":
      return "behind";
    case "completed_over":
      // Delivered over booked — mild ahead, not spend-rate over-pacing.
      return "ahead";
    case "in_progress":
    case "completed":
      return "on-track";
    case "pending":
      return "no-data";
    default:
      return "no-data";
  }
}

export type DirectLineInput = {
  clientName: string;
  campaignName: string;
  mbaNumber: string;
  lineItemId: string;
  lineItemName: string;
  lineItemStatus: string;
  burstStatuses?: string[];
  bookedCost: number;
  spentCost: number;
};

export function mapDirectLineToOverviewItem(row: DirectLineInput): OverviewAttentionItem {
  return {
    id: `direct:${row.mbaNumber}:${row.lineItemId}`,
    channel: "direct",
    clientName: row.clientName,
    campaignName: row.campaignName,
    mbaNumber: row.mbaNumber,
    lineItemLabel: row.lineItemName?.trim() || row.lineItemId,
    status: overviewStatusFromDirectLineStatus(
      row.lineItemStatus,
      row.burstStatuses ?? []
    ),
    budget: row.bookedCost,
    spendToDate: row.spentCost,
    href: CHANNEL_HREF.direct,
  };
}

export type AdServingLineInput = {
  clientName: string;
  campaignName: string;
  mbaNumber: string;
  lineItemId: string;
  lineItemLabel?: string | null;
  lineItemStatus: "serving" | "no-data";
};

export function mapAdServingRowToOverviewItem(row: AdServingLineInput): OverviewAttentionItem {
  return {
    id: `ad-serving:${row.mbaNumber}:${row.lineItemId}`,
    channel: "ad-serving",
    clientName: row.clientName,
    campaignName: row.campaignName,
    mbaNumber: row.mbaNumber,
    lineItemLabel: row.lineItemLabel?.trim() || row.lineItemId,
    status: row.lineItemStatus === "serving" ? "on-track" : "no-data",
    budget: null,
    spendToDate: null,
    href: CHANNEL_HREF["ad-serving"],
  };
}

function spendGap(item: OverviewAttentionItem): number {
  if (item.budget == null || item.spendToDate == null) return 0;
  // Positive gap = under-spent relative to budget (worse for behind list).
  return item.budget - item.spendToDate;
}

function overBurnRatio(item: OverviewAttentionItem): number {
  if (item.budget == null || item.budget <= 0 || item.spendToDate == null) return 0;
  return item.spendToDate / item.budget;
}

export function summarizeOverviewItems(
  items: OverviewAttentionItem[],
  kpiPending = 0
): OverviewPayload {
  const counts: OverviewStatusCounts = {
    behind: 0,
    onTrack: 0,
    ahead: 0,
    overPacing: 0,
    noData: 0,
    kpiPending,
  };

  for (const item of items) {
    switch (item.status) {
      case "behind":
        counts.behind += 1;
        break;
      case "on-track":
        counts.onTrack += 1;
        break;
      case "ahead":
        counts.ahead += 1;
        break;
      case "over-pacing":
        counts.overPacing += 1;
        break;
      case "no-data":
        counts.noData += 1;
        break;
      default: {
        const _exhaustive: never = item.status;
        void _exhaustive;
      }
    }
  }

  const underperforming = items
    .filter((i) => i.status === "behind")
    .toSorted((a, b) => spendGap(b) - spendGap(a));

  const overPacing = items
    .filter((i) => i.status === "over-pacing")
    .toSorted((a, b) => overBurnRatio(b) - overBurnRatio(a));

  const aheadOnDelivery = items
    .filter((i) => i.status === "ahead")
    .toSorted((a, b) => overBurnRatio(b) - overBurnRatio(a));

  // asOfDate filled by caller
  return {
    asOfDate: "",
    counts,
    underperforming,
    overPacing,
    aheadOnDelivery,
  };
}
