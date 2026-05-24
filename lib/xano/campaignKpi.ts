import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";

/**
 * Raw shape of a campaign_kpi row from Xano. Mirrors the table schema.
 *
 * Fields are nullable on the wire even when defined as numbers in the type —
 * defensive against Xano returning nulls for unset targets.
 */
export type CampaignKpiRow = {
  id: number;
  created_at: number;
  mp_client_name: string;
  mba_number: string;
  version_number: number;
  campaign_name: string;
  media_type: string;
  publisher: string;
  bid_strategy: string;
  ctr: number | null;
  cpv: number | null;
  conversion_rate: number | null;
  vtr: number | null;
  frequency: number | null;
  line_item_id: string;
};

export type MbaVersionPair = {
  mbaNumber: string;
  versionNumber: number;
};

export type FetchCampaignKpiArgs = {
  mbaVersionPairs: MbaVersionPair[];
};

/**
 * Fetches campaign_kpi rows for the supplied MBA numbers from the
 * Clients Xano group. Returns one row per (mba_number, version_number,
 * line_item_id, media_type) per the table's grain.
 *
 * Fans out one fetch per MBA.
 */
export async function fetchCampaignKpisForMbas(
  args: FetchCampaignKpiArgs
): Promise<CampaignKpiRow[]> {
  if (args.mbaVersionPairs.length === 0) return [];

  const uniqueKeys = new Set<string>();
  const uniquePairs: MbaVersionPair[] = [];
  for (const pair of args.mbaVersionPairs) {
    const key = `${pair.mbaNumber}|${pair.versionNumber}`;
    if (uniqueKeys.has(key)) continue;
    uniqueKeys.add(key);
    uniquePairs.push(pair);
  }

  const results: CampaignKpiRow[] = [];
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL");

  for (const { mbaNumber, versionNumber } of uniquePairs) {
    try {
      const rows = await fetchAllXanoPages(
        url,
        { mba_number: mbaNumber, version_number: versionNumber },
        `campaign_kpi_${mbaNumber}_v${versionNumber}`,
        200,
        50
      );
      results.push(...(rows as CampaignKpiRow[]));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        continue;
      }
      const body = (err as { response?: { data?: unknown } })?.response?.data;
      throw new Error(
        `Xano campaign_kpi GET failed for mba=${mbaNumber} version=${versionNumber}: ${status ?? "unknown"} ${String(body ?? "")}`
      );
    }
  }

  return results;
}
