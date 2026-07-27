import "server-only";

import { fetchAllMasters } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

/** Default clients per page for attention lists (KPI counts use the full portfolio). */
export const OVERVIEW_DEFAULT_PAGE_SIZE = 20;
export const OVERVIEW_MAX_PAGE_SIZE = 40;

export type OverviewClientScope = {
  /**
   * Full live-in-window (access-filtered) slug set for Snowflake fan-out + KPI
   * counts. Never null / "all" — always an explicit Set.
   */
  clientSlugs: Set<string>;
  /** Current page of slugs — attention lists only. */
  pageSlugs: string[];
  page: number;
  pageSize: number;
  totalClients: number;
  hasMore: boolean;
};

export type ResolveOverviewClientScopeArgs = {
  asOfDate: string;
  /** Auth access set; null = admin may see all live clients (still paginated). */
  accessAllowedClientSlugs: Set<string> | null;
  /** Optional single-client filter from the query string. */
  clientSlug?: string | null;
  page?: number;
  pageSize?: number;
};

function clampPage(page: number | undefined): number {
  const n = Math.floor(page ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clampPageSize(pageSize: number | undefined): number {
  const n = Math.floor(pageSize ?? OVERVIEW_DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n < 1) return OVERVIEW_DEFAULT_PAGE_SIZE;
  return Math.min(OVERVIEW_MAX_PAGE_SIZE, n);
}

/**
 * Resolve live-in-window client slugs from Xano masters (no Snowflake).
 * Fan-out uses the full access-filtered set so KPI tiles cover the portfolio;
 * pageSlugs paginate attention lists only.
 */
export async function resolveOverviewClientScope(
  args: ResolveOverviewClientScopeArgs,
  deps?: { fetchMasters?: () => Promise<MediaPlanMaster[]> }
): Promise<OverviewClientScope> {
  const page = clampPage(args.page);
  const pageSize = clampPageSize(args.pageSize);
  const filterSlug = args.clientSlug?.trim().toLowerCase() || null;

  const masters = await (deps?.fetchMasters ?? fetchAllMasters)();
  const slugSet = new Set<string>();

  for (const m of masters) {
    if (!isLiveCampaignStatus(m.campaign_status)) continue;
    if (!m.campaign_start_date || !m.campaign_end_date) continue;
    if (args.asOfDate < m.campaign_start_date || args.asOfDate > m.campaign_end_date) {
      continue;
    }
    const slug = slugifyPlanClientName(m.mp_client_name);
    if (!slug) continue;
    if (
      args.accessAllowedClientSlugs !== null &&
      !args.accessAllowedClientSlugs.has(slug)
    ) {
      continue;
    }
    if (filterSlug && slug !== filterSlug) continue;
    slugSet.add(slug);
  }

  const sorted = Array.from(slugSet).sort((a, b) => a.localeCompare(b));
  const totalClients = sorted.length;
  const start = (page - 1) * pageSize;
  const pageSlugs = sorted.slice(start, start + pageSize);
  const hasMore = start + pageSize < totalClients;

  return {
    clientSlugs: new Set(sorted),
    pageSlugs,
    page,
    pageSize,
    totalClients,
    hasMore,
  };
}
