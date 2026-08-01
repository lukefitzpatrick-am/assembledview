import "server-only";

import { readCampaignKpisForMbas } from "@/lib/data/readKpi";

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

  const rows = await readCampaignKpisForMbas(args.mbaVersionPairs);
  return rows as CampaignKpiRow[];
}
